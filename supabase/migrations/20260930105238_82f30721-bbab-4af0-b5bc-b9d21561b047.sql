-- lovable-cron-fallback-reviewed: wake-on-enqueue retry backstop, armed only while pending rows exist and unscheduled after drain
CREATE TABLE public.help_center_ticket_outbox (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  ticket_id uuid NOT NULL,
  status text NOT NULL,
  revision bigint NOT NULL,
  ticket_created_at timestamptz NOT NULL,
  ticket_updated_at timestamptz NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  delivered_at timestamptz,
  dead_at timestamptz,
  last_error text,
  UNIQUE (ticket_id, revision)
);
GRANT ALL ON public.help_center_ticket_outbox TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.help_center_ticket_outbox_id_seq TO service_role;
REVOKE ALL ON public.help_center_ticket_outbox FROM anon, authenticated;
ALTER TABLE public.help_center_ticket_outbox ENABLE ROW LEVEL SECURITY;
CREATE INDEX help_center_outbox_pending_idx ON public.help_center_ticket_outbox (next_attempt_at, id)
  WHERE delivered_at IS NULL AND dead_at IS NULL;

-- Append-only guard: no deletes, payload columns immutable.
CREATE OR REPLACE FUNCTION public.help_center_outbox_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'help_center_ticket_outbox is append-only';
  END IF;
  IF NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.ticket_id IS DISTINCT FROM OLD.ticket_id
     OR NEW.status IS DISTINCT FROM OLD.status OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.ticket_created_at IS DISTINCT FROM OLD.ticket_created_at
     OR NEW.ticket_updated_at IS DISTINCT FROM OLD.ticket_updated_at
     OR NEW.enqueued_at IS DISTINCT FROM OLD.enqueued_at THEN
    RAISE EXCEPTION 'help_center_ticket_outbox payload is immutable';
  END IF;
  IF OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
    RAISE EXCEPTION 'delivered outbox events are final';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER help_center_outbox_guard_trg
  BEFORE UPDATE OR DELETE ON public.help_center_ticket_outbox
  FOR EACH ROW EXECUTE FUNCTION public.help_center_outbox_guard();
CREATE TRIGGER help_center_outbox_no_truncate
  BEFORE TRUNCATE ON public.help_center_ticket_outbox
  FOR EACH STATEMENT EXECUTE FUNCTION public.help_center_outbox_guard();

-- Transactional enqueue from support_threads (metadata only).
CREATE OR REPLACE FUNCTION public.help_center_outbox_wake()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  -- Immediate wake (pg_net sends only after commit).
  PERFORM net.http_post(
    url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/help-center-ticket-feed',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-dispatch-secret', (SELECT value FROM public.help_center_feed_private WHERE key = 'dispatch_secret')),
    body := '{}'::jsonb);
  -- Arm retry backstop only while work is pending; disarmed by the publisher once drained.
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'help-center-ticket-feed-retry') THEN
    PERFORM cron.schedule('help-center-ticket-feed-retry', '*/5 * * * *',
      'SELECT public.help_center_outbox_wake()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- never block ticket writes; row stays queued
END $$;
REVOKE ALL ON FUNCTION public.help_center_outbox_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_outbox_wake() TO service_role;

CREATE OR REPLACE FUNCTION public.help_center_outbox_disarm()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.help_center_ticket_outbox WHERE delivered_at IS NULL AND dead_at IS NULL) THEN
    RETURN false;
  END IF;
  BEGIN PERFORM cron.unschedule('help-center-ticket-feed-retry'); EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.help_center_outbox_disarm() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_outbox_disarm() TO service_role;

CREATE OR REPLACE FUNCTION public.help_center_enqueue_ticket_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hc_outbox:' || NEW.id::text, 0));
  SELECT coalesce(max(revision), 0) + 1 INTO v_rev
    FROM public.help_center_ticket_outbox WHERE ticket_id = NEW.id;
  INSERT INTO public.help_center_ticket_outbox
    (ticket_id, status, revision, ticket_created_at, ticket_updated_at)
  VALUES (NEW.id, NEW.status, v_rev, NEW.created_at, coalesce(NEW.updated_at, now()));
  PERFORM public.help_center_outbox_wake();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.help_center_enqueue_ticket_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER help_center_enqueue_ticket_event_trg
  AFTER INSERT OR UPDATE OF status ON public.support_threads
  FOR EACH ROW EXECUTE FUNCTION public.help_center_enqueue_ticket_event();

-- Private dispatch secret (dedicated; not app_settings, not service role).
CREATE TABLE public.help_center_feed_private (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.help_center_feed_private TO service_role;
REVOKE ALL ON public.help_center_feed_private FROM anon, authenticated;
ALTER TABLE public.help_center_feed_private ENABLE ROW LEVEL SECURITY;
INSERT INTO public.help_center_feed_private (key, value)
VALUES ('dispatch_secret', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.help_center_verify_dispatch(p_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(length(p_token) >= 32 AND EXISTS (
    SELECT 1 FROM public.help_center_feed_private
    WHERE key = 'dispatch_secret'
      AND extensions.digest(value, 'sha256') = extensions.digest(p_token, 'sha256')), false)
$$;
REVOKE ALL ON FUNCTION public.help_center_verify_dispatch(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_verify_dispatch(text) TO service_role;

-- Claim a batch with a lease (SKIP LOCKED).
CREATE OR REPLACE FUNCTION public.help_center_outbox_claim(p_limit integer DEFAULT 25, p_lease_seconds integer DEFAULT 120)
RETURNS SETOF public.help_center_ticket_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.help_center_ticket_outbox o
     SET locked_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 600))),
         attempts = o.attempts + 1
   WHERE o.id IN (
     SELECT id FROM public.help_center_ticket_outbox
      WHERE delivered_at IS NULL AND dead_at IS NULL
        AND next_attempt_at <= now()
        AND (locked_until IS NULL OR locked_until < now())
      ORDER BY id
      LIMIT greatest(1, least(p_limit, 100))
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*;
END $$;
REVOKE ALL ON FUNCTION public.help_center_outbox_claim(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_outbox_claim(integer, integer) TO service_role;

-- Record outcome; bounded exponential backoff (30s .. 1h), dead after max attempts.
CREATE OR REPLACE FUNCTION public.help_center_outbox_result(p_id bigint, p_ok boolean, p_error text DEFAULT NULL, p_max_attempts integer DEFAULT 12)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_attempts int;
BEGIN
  SELECT attempts INTO v_attempts FROM public.help_center_ticket_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_ok THEN
    UPDATE public.help_center_ticket_outbox
       SET delivered_at = coalesce(delivered_at, now()), locked_until = NULL, last_error = NULL
     WHERE id = p_id;
  ELSIF v_attempts >= p_max_attempts THEN
    UPDATE public.help_center_ticket_outbox
       SET dead_at = now(), locked_until = NULL, last_error = left(coalesce(p_error, 'error'), 200)
     WHERE id = p_id AND delivered_at IS NULL;
  ELSE
    UPDATE public.help_center_ticket_outbox
       SET next_attempt_at = now() + make_interval(secs => least(3600, 30 * (2 ^ greatest(v_attempts - 1, 0)))::int)
                             + make_interval(secs => floor(random() * 10)::int),
           locked_until = NULL, last_error = left(coalesce(p_error, 'error'), 200)
     WHERE id = p_id AND delivered_at IS NULL;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.help_center_outbox_result(bigint, boolean, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_outbox_result(bigint, boolean, text, integer) TO service_role;
