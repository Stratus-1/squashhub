-- NOT APPLIED. Staged for owner-approved application via the migration tool.
-- Help Center delivery gate: paused (default) / pilot (server-side allowlist) / live.
-- Additive only. Never deletes outbox rows, never changes delivered/dead flags.
-- Why: pausing the retry cron is not a kill switch — every support_threads /
-- support_messages write calls help_center_outbox_wake() which fires an
-- immediate net.http_post. The gate lives in the database (wake + claim), so
-- neither the immediate wake nor the cron backstop can dispatch while paused.

-- 1. Explicit held state (preserves backlog without marking it delivered/dead).
ALTER TABLE public.help_center_ticket_outbox
  ADD COLUMN IF NOT EXISTS held_at timestamptz,
  ADD COLUMN IF NOT EXISTS hold_reason text
    CHECK (hold_reason IS NULL OR hold_reason ~ '^[a-z0-9_]{1,64}$');

-- 2. Append-only guard, extended for hold metadata.
CREATE OR REPLACE FUNCTION public.help_center_outbox_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION 'help_center_ticket_outbox is append-only';
  END IF;
  IF NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id
     OR NEW.status IS DISTINCT FROM OLD.status OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.event_type IS DISTINCT FROM OLD.event_type OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.ticket_created_at IS DISTINCT FROM OLD.ticket_created_at
     OR NEW.ticket_updated_at IS DISTINCT FROM OLD.ticket_updated_at
     OR NEW.enqueued_at IS DISTINCT FROM OLD.enqueued_at THEN
    RAISE EXCEPTION 'help_center_ticket_outbox payload is immutable';
  END IF;
  IF OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
    RAISE EXCEPTION 'delivered outbox events are final';
  END IF;
  IF (NEW.held_at IS DISTINCT FROM OLD.held_at OR NEW.hold_reason IS DISTINCT FROM OLD.hold_reason) THEN
    IF OLD.delivered_at IS NOT NULL OR OLD.dead_at IS NOT NULL THEN
      RAISE EXCEPTION 'hold state is only valid on undelivered events';
    END IF;
    IF (NEW.held_at IS NULL) <> (NEW.hold_reason IS NULL) THEN
      RAISE EXCEPTION 'held_at and hold_reason must be set or cleared together';
    END IF;
  END IF;
  IF NEW.held_at IS NOT NULL AND (
       (NEW.delivered_at IS NOT NULL AND OLD.delivered_at IS NULL)
    OR (NEW.dead_at IS NOT NULL AND OLD.dead_at IS NULL)
    OR NEW.attempts IS DISTINCT FROM OLD.attempts) THEN
    RAISE EXCEPTION 'held events cannot be delivered, killed or attempted';
  END IF;
  RETURN NEW;
END $$;

DROP INDEX IF EXISTS public.help_center_outbox_pending_idx;
CREATE INDEX help_center_outbox_pending_idx ON public.help_center_ticket_outbox (next_attempt_at, id)
  WHERE delivered_at IS NULL AND dead_at IS NULL AND held_at IS NULL;

-- 3. Server-side pilot allowlist (service role only).
CREATE TABLE IF NOT EXISTS public.help_center_pilot_allowlist (
  ticket_id uuid PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by text NOT NULL DEFAULT 'pilot_enqueue'
);
GRANT ALL ON public.help_center_pilot_allowlist TO service_role;
REVOKE ALL ON public.help_center_pilot_allowlist FROM PUBLIC, anon, authenticated;
ALTER TABLE public.help_center_pilot_allowlist ENABLE ROW LEVEL SECURITY;

-- 4. Delivery mode. Missing or invalid value => paused (fail closed).
INSERT INTO public.help_center_feed_private (key, value)
VALUES ('delivery_mode', 'paused')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.help_center_delivery_mode()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN v IN ('paused','pilot','live') THEN v ELSE 'paused' END
    FROM (SELECT (SELECT value FROM public.help_center_feed_private WHERE key = 'delivery_mode') AS v) s
$$;
REVOKE ALL ON FUNCTION public.help_center_delivery_mode() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_delivery_mode() TO service_role;

-- Separate, explicit switch (not invoked by this migration).
CREATE OR REPLACE FUNCTION public.help_center_set_delivery_mode(p_mode text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('paused','pilot','live') THEN
    RAISE EXCEPTION 'invalid delivery mode';
  END IF;
  INSERT INTO public.help_center_feed_private (key, value) VALUES ('delivery_mode', p_mode)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  RETURN p_mode;
END $$;
REVOKE ALL ON FUNCTION public.help_center_set_delivery_mode(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_set_delivery_mode(text) TO service_role;

-- 5. Wake: no immediate POST and no cron arming while paused.
CREATE OR REPLACE FUNCTION public.help_center_outbox_wake()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF public.help_center_delivery_mode() = 'paused' THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/help-center-ticket-feed',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-dispatch-secret', (SELECT value FROM public.help_center_feed_private WHERE key = 'dispatch_secret')),
    body := '{}'::jsonb);
  -- Arm the retry backstop only if it does not exist at all; never re-activates a paused job.
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'help-center-ticket-feed-retry') THEN
    PERFORM cron.schedule('help-center-ticket-feed-retry', '*/5 * * * *',
      'SELECT public.help_center_outbox_wake()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- never block ticket writes; row stays queued
END $$;
REVOKE ALL ON FUNCTION public.help_center_outbox_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_outbox_wake() TO service_role;

-- 6. Claim: zero in paused; allowlist-only in pilot; never held rows.
CREATE OR REPLACE FUNCTION public.help_center_outbox_claim(p_limit integer DEFAULT 25, p_lease_seconds integer DEFAULT 120)
RETURNS SETOF public.help_center_ticket_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mode text := public.help_center_delivery_mode();
BEGIN
  IF v_mode = 'paused' THEN
    RETURN;
  END IF;
  RETURN QUERY
  UPDATE public.help_center_ticket_outbox o
     SET locked_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 600))),
         attempts = o.attempts + 1
   WHERE o.id IN (
     SELECT x.id FROM public.help_center_ticket_outbox x
      WHERE x.delivered_at IS NULL AND x.dead_at IS NULL AND x.held_at IS NULL
        AND x.next_attempt_at <= now()
        AND (x.locked_until IS NULL OR x.locked_until < now())
        AND (v_mode = 'live'
             OR (v_mode = 'pilot' AND EXISTS (
                   SELECT 1 FROM public.help_center_pilot_allowlist a WHERE a.ticket_id = x.ticket_id)))
      ORDER BY x.id
      LIMIT greatest(1, least(p_limit, 100))
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*;
END $$;
REVOKE ALL ON FUNCTION public.help_center_outbox_claim(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_outbox_claim(integer, integer) TO service_role;

-- 7. Disarm: count only claimable work; deactivate instead of deleting the job.
CREATE OR REPLACE FUNCTION public.help_center_outbox_disarm()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mode text := public.help_center_delivery_mode(); v_job bigint;
BEGIN
  IF v_mode <> 'paused' AND EXISTS (
       SELECT 1 FROM public.help_center_ticket_outbox x
        WHERE x.delivered_at IS NULL AND x.dead_at IS NULL AND x.held_at IS NULL
          AND (v_mode = 'live' OR EXISTS (
                SELECT 1 FROM public.help_center_pilot_allowlist a WHERE a.ticket_id = x.ticket_id))) THEN
    RETURN false;
  END IF;
  SELECT jobid INTO v_job FROM cron.job WHERE jobname = 'help-center-ticket-feed-retry' AND active LIMIT 1;
  IF v_job IS NOT NULL THEN
    BEGIN PERFORM cron.alter_job(job_id := v_job, active := false); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.help_center_outbox_disarm() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_outbox_disarm() TO service_role;

-- 8. Hold the pre-pilot backlog (resolved/closed/deleted tickets). Aggregate only.
CREATE OR REPLACE FUNCTION public.help_center_hold_backlog()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.help_center_ticket_outbox o
     SET held_at = now(), hold_reason = 'pre_pilot_backlog'
   WHERE o.delivered_at IS NULL AND o.dead_at IS NULL AND o.held_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.help_center_pilot_allowlist a WHERE a.ticket_id = o.ticket_id)
     AND NOT EXISTS (SELECT 1 FROM public.support_threads s
                      WHERE s.id = o.ticket_id AND s.status IN ('open','pending','waiting','in_progress'));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('held', v_count);
END $$;
REVOKE ALL ON FUNCTION public.help_center_hold_backlog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_hold_backlog() TO service_role;

-- 9. Allowlist + enqueue currently active tickets. Idempotent; aggregate only.
CREATE OR REPLACE FUNCTION public.help_center_pilot_enqueue()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; v_rev bigint; v_new integer := 0; v_enq integer := 0; v_n integer;
BEGIN
  FOR t IN
    SELECT id FROM public.support_threads
     WHERE status IN ('open','pending','waiting','in_progress')
     ORDER BY created_at, id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('hc_outbox:' || t.id::text, 0));
    INSERT INTO public.help_center_pilot_allowlist (ticket_id) VALUES (t.id)
    ON CONFLICT (ticket_id) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_new := v_new + v_n;
    IF EXISTS (SELECT 1 FROM public.help_center_ticket_outbox
                WHERE ticket_id = t.id AND delivered_at IS NULL AND dead_at IS NULL AND held_at IS NULL)
       OR EXISTS (SELECT 1 FROM public.help_center_ticket_outbox
                   WHERE ticket_id = t.id AND event_type = 'case.created' AND delivered_at IS NOT NULL) THEN
      CONTINUE;
    END IF;
    SELECT coalesce(max(revision), 0) + 1 INTO v_rev
      FROM public.help_center_ticket_outbox WHERE ticket_id = t.id;
    INSERT INTO public.help_center_ticket_outbox
      (ticket_id, event_type, status, revision, ticket_created_at, ticket_updated_at)
    SELECT s.id, 'case.created', s.status, v_rev, s.created_at, coalesce(s.updated_at, now())
      FROM public.support_threads s
     WHERE s.id = t.id AND s.status IN ('open','pending','waiting','in_progress');
    GET DIAGNOSTICS v_n = ROW_COUNT; v_enq := v_enq + v_n;
  END LOOP;
  IF v_enq > 0 THEN
    PERFORM public.help_center_outbox_wake(); -- no-op while paused
  END IF;
  RETURN jsonb_build_object('allowlisted_new', v_new,
    'allowlisted_total', (SELECT count(*) FROM public.help_center_pilot_allowlist),
    'enqueued', v_enq);
END $$;
REVOKE ALL ON FUNCTION public.help_center_pilot_enqueue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_pilot_enqueue() TO service_role;
