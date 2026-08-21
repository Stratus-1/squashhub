
-- 1. Club scoping + context on the delivery log ------------------------------
ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS club_id uuid,
  ADD COLUMN IF NOT EXISTS context jsonb;

CREATE INDEX IF NOT EXISTS email_send_log_club_created_idx
  ON public.email_send_log (club_id, created_at DESC);

GRANT SELECT ON public.email_send_log TO authenticated;

DROP POLICY IF EXISTS "Club admins can read their club send log" ON public.email_send_log;
CREATE POLICY "Club admins can read their club send log"
  ON public.email_send_log FOR SELECT TO authenticated
  USING (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id));

-- Backfill club scoping from the recipient address (single-club membership).
UPDATE public.email_send_log l
   SET club_id = cm.club_id
  FROM public.club_members cm
 WHERE l.club_id IS NULL
   AND cm.email IS NOT NULL
   AND lower(cm.email) = lower(l.recipient_email)
   AND cm.club_id IS NOT NULL;

-- 2. Paced outbox ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid,
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  body text NOT NULL DEFAULT '',
  url text,
  cta_label text,
  kind text NOT NULL DEFAULT 'notification',
  ref_id uuid,
  status text NOT NULL DEFAULT 'queued',
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_outbox_status_chk
    CHECK (status IN ('queued','sending','sent','failed','cancelled'))
);

CREATE INDEX IF NOT EXISTS email_outbox_due_idx
  ON public.email_outbox (status, scheduled_for);
CREATE INDEX IF NOT EXISTS email_outbox_club_idx
  ON public.email_outbox (club_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.email_outbox TO authenticated;
GRANT ALL ON public.email_outbox TO service_role;

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club admins read outbox" ON public.email_outbox;
CREATE POLICY "Club admins read outbox"
  ON public.email_outbox FOR SELECT TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));

DROP POLICY IF EXISTS "Club admins queue outbox" ON public.email_outbox;
CREATE POLICY "Club admins queue outbox"
  ON public.email_outbox FOR INSERT TO authenticated
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

DROP POLICY IF EXISTS "Club admins manage outbox" ON public.email_outbox;
CREATE POLICY "Club admins manage outbox"
  ON public.email_outbox FOR UPDATE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE OR REPLACE FUNCTION public.touch_email_outbox()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_email_outbox ON public.email_outbox;
CREATE TRIGGER trg_touch_email_outbox
  BEFORE UPDATE ON public.email_outbox
  FOR EACH ROW EXECUTE FUNCTION public.touch_email_outbox();

-- 3. Single-flight lease for the queue worker --------------------------------
CREATE TABLE IF NOT EXISTS public.email_outbox_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  lease_until timestamptz,
  paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.email_outbox_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

GRANT ALL ON public.email_outbox_state TO service_role;
ALTER TABLE public.email_outbox_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_email_outbox_batch(p_limit integer DEFAULT 5, p_lease_seconds integer DEFAULT 120)
RETURNS SETOF public.email_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_got boolean := false;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND current_user <> 'service_role'
     AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only the queue worker may claim outbox messages';
  END IF;

  UPDATE public.email_outbox_state
     SET lease_until = now() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
         updated_at = now()
   WHERE id = true
     AND paused = false
     AND (lease_until IS NULL OR lease_until < now())
  RETURNING true INTO v_got;

  IF NOT COALESCE(v_got, false) THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.email_outbox o
     SET status = 'sending', attempts = o.attempts + 1, updated_at = now()
   WHERE o.id IN (
     SELECT id FROM public.email_outbox
      WHERE status = 'queued' AND scheduled_for <= now()
      ORDER BY scheduled_for
      LIMIT GREATEST(LEAST(p_limit, 25), 1)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_outbox_batch(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_outbox_batch(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.release_email_outbox_lease()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.email_outbox_state SET lease_until = NULL, updated_at = now() WHERE id = true;
$$;
REVOKE ALL ON FUNCTION public.release_email_outbox_lease() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_email_outbox_lease() TO service_role;

-- 4. Notification delivery now paces bursts through the outbox ---------------
CREATE OR REPLACE FUNCTION public.deliver_email_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  internal_secret text;
  request_id bigint;
  target_email text;
  target_user uuid;
  target_name uuid;
  v_name text;
  target_club_id uuid;
  should_send boolean := false;
  edge_url text;
  v_recent int := 0;
  v_last timestamptz;
  v_when timestamptz;
BEGIN
  IF COALESCE(NEW.data->>'suppress_email', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.type IN ('challenge', 'match', 'booking', 'marketing', 'admin', 'reminder') THEN
    should_send := true;
  ELSIF NEW.type IN ('tournament_invite', 'tournament_partner_invite', 'tournament_paid', 'tournament_partner_confirmed')
        AND COALESCE(NEW.data->>'send_email', 'false') = 'true' THEN
    should_send := true;
  END IF;

  IF NOT should_send THEN
    RETURN NEW;
  END IF;

  target_user := NEW.user_id;
  IF NEW.club_member_id IS NOT NULL THEN
    SELECT cm.user_id, cm.email, cm.name, cm.club_id
      INTO target_user, target_email, v_name, target_club_id
      FROM public.club_members cm
     WHERE cm.id = NEW.club_member_id;
    target_user := COALESCE(NEW.user_id, target_user);
  END IF;

  IF target_user IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(p.email), ''), target_email),
           COALESCE(NULLIF(trim(p.name), ''), v_name)
      INTO target_email, v_name
      FROM public.profiles p
     WHERE p.id = target_user;
  END IF;

  IF target_email IS NULL OR length(trim(target_email)) = 0 THEN
    RETURN NEW;
  END IF;

  IF target_club_id IS NULL AND (NEW.data ? 'club_id') THEN
    target_club_id := (NEW.data->>'club_id')::uuid;
  END IF;

  -- Burst protection: when a club is already sending, queue the message in the
  -- paced outbox instead of firing another immediate SMTP request. Mail
  -- providers (notably Gmail) temporarily block accounts that burst.
  IF target_club_id IS NOT NULL THEN
    SELECT count(*), max(scheduled_for)
      INTO v_recent, v_last
      FROM public.email_outbox
     WHERE club_id = target_club_id
       AND status IN ('queued', 'sending');

    IF v_recent = 0 THEN
      SELECT count(*) INTO v_recent
        FROM public.email_send_log
       WHERE club_id = target_club_id
         AND created_at > now() - interval '5 minutes';
      v_recent := GREATEST(v_recent - 4, 0);
    END IF;

    IF v_recent > 0 THEN
      v_when := GREATEST(COALESCE(v_last, now()) + interval '90 seconds', now());
      INSERT INTO public.email_outbox (
        club_id, club_member_id, recipient_email, recipient_name,
        subject, body, url, cta_label, kind, scheduled_for
      ) VALUES (
        target_club_id, NEW.club_member_id, target_email, v_name,
        COALESCE(NULLIF(NEW.title, ''), 'Notification'), COALESCE(NEW.message, ''), NEW.url,
        CASE WHEN NEW.type IN ('tournament_invite','tournament_partner_invite')
             THEN 'Accept / Register' ELSE 'Open in SquashHub' END,
        NEW.type, v_when
      );
      RETURN NEW;
    END IF;
  END IF;

  SELECT value INTO internal_secret FROM public.app_settings WHERE key = 'email_private_internal_secret';
  IF internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value INTO edge_url FROM public.app_settings WHERE key = 'email_edge_function_url';
  IF edge_url IS NULL OR length(trim(edge_url)) = 0 THEN
    edge_url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/email-notifications?action=send';
  END IF;

  SELECT net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'targetUserId', target_user,
      'targetEmail', target_email,
      'targetName', v_name,
      'clubId', target_club_id,
      'title', NEW.title,
      'body', NEW.message,
      'message', NEW.message,
      'url', NEW.url,
      'type', NEW.type,
      'data', NEW.data
    )
  ) INTO request_id;

  RETURN NEW;
END;
$$;
