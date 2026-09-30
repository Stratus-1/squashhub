-- Synthetic assertions for the Help Center pilot gate (runs after the pending migration).
\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.ok(c boolean, msg text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN IF NOT coalesce(c,false) THEN RAISE EXCEPTION 'FAIL: %', msg; END IF; RAISE NOTICE 'PASS: %', msg; END $$;
CREATE TEMP TABLE snap AS SELECT * FROM public.help_center_ticket_outbox;

-- Baseline mirrors production aggregates.
SELECT pg_temp.ok((SELECT count(*) FROM public.help_center_ticket_outbox WHERE delivered_at IS NULL AND dead_at IS NULL)=22, 'baseline 22 undelivered events');
SELECT pg_temp.ok((SELECT count(DISTINCT ticket_id) FROM public.help_center_ticket_outbox)=10, 'baseline 10 tickets in backlog');

-- 1. Default mode is paused.
SELECT pg_temp.ok(public.help_center_delivery_mode()='paused', 'default delivery mode is paused');

-- 2. Paused blocks the immediate wake path (support writes) and the cron path.
INSERT INTO support_messages(thread_id) SELECT id FROM support_threads WHERE status='resolved' LIMIT 1;
UPDATE support_threads SET status='closed' WHERE id=(SELECT id FROM support_threads WHERE status='resolved' LIMIT 1);
SELECT public.help_center_outbox_wake();                      -- what the cron command runs
SELECT pg_temp.ok((SELECT count(*) FROM net.calls)=0, 'paused: no immediate or cron net.http_post');
SELECT pg_temp.ok((SELECT count(*) FROM public.help_center_outbox_claim(100,120))=0, 'paused: claim returns zero');
SELECT pg_temp.ok((SELECT bool_and(NOT active) FROM cron.job) AND (SELECT count(*) FROM cron.job)=1, 'paused: cron job exists and stays inactive');
SELECT pg_temp.ok(public.help_center_outbox_disarm() AND (SELECT count(*) FROM cron.job)=1, 'disarm never deletes the job');

-- 3. Hold backlog: all undelivered rows of non-active tickets, flags untouched.
SELECT pg_temp.ok((public.help_center_hold_backlog()->>'held')::int=24, 'hold_backlog holds 22 + 2 new synthetic rows (aggregate only)');
SELECT pg_temp.ok((public.help_center_hold_backlog()->>'held')::int=0, 'hold_backlog is idempotent');
SELECT pg_temp.ok(NOT EXISTS (
  SELECT 1 FROM snap s JOIN public.help_center_ticket_outbox o USING (id)
   WHERE o.delivered_at IS DISTINCT FROM s.delivered_at OR o.dead_at IS DISTINCT FROM s.dead_at
      OR o.attempts <> s.attempts OR o.event_id <> s.event_id OR o.status <> s.status OR o.revision <> s.revision),
  'held rows keep delivered/dead/attempts/payload unchanged');
SELECT pg_temp.ok((SELECT count(*) FROM public.help_center_ticket_outbox) >= (SELECT count(*) FROM snap), 'no rows deleted');

-- 4. Append-only protections still hold (each in a subtransaction).
DO $$ BEGIN
  BEGIN DELETE FROM public.help_center_ticket_outbox; RAISE EXCEPTION 'x'; EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN RAISE EXCEPTION 'FAIL delete: %', SQLERRM; END IF; END;
  BEGIN UPDATE public.help_center_ticket_outbox SET status='open'; RAISE EXCEPTION 'x'; EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%immutable%' THEN RAISE EXCEPTION 'FAIL payload: %', SQLERRM; END IF; END;
  BEGIN UPDATE public.help_center_ticket_outbox SET delivered_at=now() WHERE held_at IS NOT NULL; RAISE EXCEPTION 'x'; EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%held events%' THEN RAISE EXCEPTION 'FAIL held deliver: %', SQLERRM; END IF; END;
  BEGIN UPDATE public.help_center_ticket_outbox SET held_at=NULL WHERE held_at IS NOT NULL; RAISE EXCEPTION 'x'; EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%together%' THEN RAISE EXCEPTION 'FAIL half-clear: %', SQLERRM; END IF; END;
  BEGIN TRUNCATE public.help_center_ticket_outbox; RAISE EXCEPTION 'x'; EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN RAISE EXCEPTION 'FAIL truncate: %', SQLERRM; END IF; END;
  RAISE NOTICE 'PASS: append-only, payload, held and truncate guards';
END $$;

-- 5. Pilot enqueue: 4 open tickets, idempotent, aggregate-only output.
SELECT pg_temp.ok(public.help_center_pilot_enqueue() = '{"enqueued": 4, "allowlisted_new": 4, "allowlisted_total": 4}'::jsonb, 'pilot_enqueue: 4 allowlisted, 4 enqueued');
SELECT pg_temp.ok(public.help_center_pilot_enqueue() = '{"enqueued": 0, "allowlisted_new": 0, "allowlisted_total": 4}'::jsonb, 'pilot_enqueue is idempotent');
SELECT pg_temp.ok((SELECT count(*) FROM net.calls)=0, 'pilot_enqueue wake is a no-op while paused');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.help_center_pilot_allowlist a JOIN support_threads s ON s.id=a.ticket_id WHERE s.status NOT IN ('open','pending','waiting','in_progress')), 'allowlist holds only active tickets');

-- 6. Pilot mode claims only allowlisted, unheld events.
SELECT public.help_center_set_delivery_mode('pilot');
INSERT INTO support_threads(status) VALUES ('open');           -- new unallowlisted ticket
SELECT pg_temp.ok((SELECT count(*) FROM net.calls)>=1, 'pilot: immediate wake path active again');
CREATE TEMP TABLE claimed AS SELECT * FROM public.help_center_outbox_claim(100,120);
SELECT pg_temp.ok((SELECT count(*) FROM claimed)=4, 'pilot: exactly the 4 allowlisted events claimed');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM claimed c WHERE c.held_at IS NOT NULL
   OR NOT EXISTS (SELECT 1 FROM public.help_center_pilot_allowlist a WHERE a.ticket_id=c.ticket_id)
   OR c.ticket_id IN (SELECT id FROM support_threads WHERE status IN ('resolved','closed'))),
  'pilot: never held, unallowlisted or resolved backlog');
SELECT pg_temp.ok((SELECT bool_and(NOT active) FROM cron.job), 'pilot: paused cron job not reactivated');

-- 7. Existing retry/backoff semantics unchanged.
SELECT public.help_center_outbox_result((SELECT min(id) FROM claimed), false, 'http_500', 12);
SELECT pg_temp.ok((SELECT next_attempt_at > now() AND locked_until IS NULL FROM public.help_center_ticket_outbox WHERE id=(SELECT min(id) FROM claimed)), 'failure keeps backoff');
SELECT public.help_center_outbox_result((SELECT max(id) FROM claimed), true, NULL, 12);
SELECT pg_temp.ok((SELECT delivered_at IS NOT NULL FROM public.help_center_ticket_outbox WHERE id=(SELECT max(id) FROM claimed)), 'success marks delivered');
SELECT pg_temp.ok((SELECT count(*) FROM public.help_center_ticket_outbox WHERE held_at IS NOT NULL AND delivered_at IS NULL AND dead_at IS NULL)=24, 'backlog still held after pilot run');

-- 8. Invalid/missing mode fails closed; back to paused.
UPDATE public.help_center_feed_private SET value='bogus' WHERE key='delivery_mode';
SELECT pg_temp.ok(public.help_center_delivery_mode()='paused', 'invalid mode => paused');
DELETE FROM public.help_center_feed_private WHERE key='delivery_mode';
SELECT pg_temp.ok(public.help_center_delivery_mode()='paused', 'missing mode => paused');

-- 9. Grants: nothing reachable by anon/authenticated.
SELECT pg_temp.ok(NOT has_table_privilege('authenticated','public.help_center_pilot_allowlist','SELECT')
  AND NOT has_table_privilege('anon','public.help_center_pilot_allowlist','SELECT'), 'allowlist not readable by app roles');
SELECT pg_temp.ok(NOT has_function_privilege('authenticated','public.help_center_hold_backlog()','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.help_center_pilot_enqueue()','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.help_center_set_delivery_mode(text)','EXECUTE')
  AND NOT has_function_privilege('anon','public.help_center_delivery_mode()','EXECUTE'), 'procedures service_role only');
SELECT pg_temp.ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.help_center_pilot_allowlist'::regclass), 'RLS on allowlist');
