-- Synthetic pre-gate state mirroring production aggregates (no real data):
-- 10 resolved tickets carrying 22 undelivered events (1 failed attempt each),
-- 4 open tickets with no outbox rows, paused retry cron job.
\set ON_ERROR_STOP on
INSERT INTO cron.job(jobname,schedule,command,active)
VALUES ('help-center-ticket-feed-retry','*/5 * * * *','SELECT public.help_center_outbox_wake()', false);

DO $$ DECLARE i int; tid uuid; BEGIN
  FOR i IN 1..10 LOOP
    INSERT INTO support_threads(status) VALUES ('resolved') RETURNING id INTO tid;  -- case.created
    INSERT INTO support_messages(thread_id) VALUES (tid);                           -- case.updated
    IF i <= 2 THEN INSERT INTO support_messages(thread_id) VALUES (tid); END IF;
  END LOOP;
END $$;
-- One failed attempt each, via the existing (pre-gate) claim/result RPCs.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM public.help_center_outbox_claim(100, 120) LOOP
    PERFORM public.help_center_outbox_result(r.id, false, 'http_401', 12);
  END LOOP;
END $$;
UPDATE public.help_center_ticket_outbox SET next_attempt_at = now() - interval '1 minute';

-- 4 open tickets that pre-date the feed (triggers bypassed => no outbox rows).
SET session_replication_role = replica;
INSERT INTO support_threads(status) SELECT 'open' FROM generate_series(1,4);
SET session_replication_role = origin;
-- Re-pause cron (old wake may not change it, but be explicit) and clear stub call log.
UPDATE cron.job SET active = false;
TRUNCATE net.calls;
