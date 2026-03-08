-- Transactional email fallback for in-app notifications
-- Goal: if a user has no push subscription/device token, send an email for important notifications (challenge/match/reminder/event).
--
-- Delivery flow:
-- notifications INSERT -> deliver_email_for_notification() -> pg_net -> email-notifications edge function
--
-- Notes:
-- - Marketing emails are opt-in (default off).
-- - Transactional emails are on by default, but "fallback-only" (only when no push is configured).

-- 1) Preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  transactional_email_enabled boolean NOT NULL DEFAULT true,
  marketing_email_enabled boolean NOT NULL DEFAULT false,
  email_fallback_only boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notification_preferences' AND policyname = 'Users can view own notification preferences'
  ) THEN
    CREATE POLICY "Users can view own notification preferences"
      ON public.notification_preferences FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notification_preferences' AND policyname = 'Users can manage own notification preferences'
  ) THEN
    CREATE POLICY "Users can manage own notification preferences"
      ON public.notification_preferences FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notification_preferences' AND policyname = 'Admins can view all notification preferences'
  ) THEN
    CREATE POLICY "Admins can view all notification preferences"
      ON public.notification_preferences FOR SELECT TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Internal secret for Postgres -> edge function calls (kept private)
INSERT INTO public.app_settings (key, value)
VALUES (
  'email_private_internal_secret',
  encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'hex')
)
ON CONFLICT (key) DO NOTHING;

-- 3) Helper: should we email this notification?
CREATE OR REPLACE FUNCTION public.should_email_notification(_user_id uuid, _type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.notification_preferences%ROWTYPE;
  transactional_enabled boolean := true;
  marketing_enabled boolean := false;
  fallback_only boolean := true;
  has_push boolean := false;
BEGIN
  SELECT * INTO p FROM public.notification_preferences WHERE user_id = _user_id;
  IF FOUND THEN
    transactional_enabled := COALESCE(p.transactional_email_enabled, true);
    marketing_enabled := COALESCE(p.marketing_email_enabled, false);
    fallback_only := COALESCE(p.email_fallback_only, true);
  END IF;

  -- Marketing is opt-in only.
  IF _type = 'marketing' THEN
    RETURN marketing_enabled;
  END IF;

  IF transactional_enabled IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF fallback_only IS TRUE THEN
    SELECT EXISTS (
      SELECT 1 FROM public.push_subscriptions ps WHERE ps.user_id = _user_id
    ) OR EXISTS (
      SELECT 1 FROM public.device_push_tokens dt WHERE dt.user_id = _user_id
    )
    INTO has_push;

    IF has_push THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- 4) Trigger: deliver transactional email after notification insert
CREATE OR REPLACE FUNCTION public.deliver_email_for_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  internal_secret text;
  request_id bigint;
  target_email text;
BEGIN
  -- Only email when preferences allow it.
  IF public.should_email_notification(NEW.user_id, NEW.type) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Must have a usable email address.
  SELECT email INTO target_email FROM public.profiles WHERE id = NEW.user_id;
  IF target_email IS NULL OR length(trim(target_email)) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT value
  INTO internal_secret
  FROM public.app_settings
  WHERE key = 'email_private_internal_secret';

  IF internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := 'https://awbrbrcdowoxsvarhzeg.supabase.co/functions/v1/email-notifications?action=send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'targetUserId', NEW.user_id,
      'title', NEW.title,
      'body', NEW.message,
      'url', NEW.url,
      'tag', NEW.id::text,
      'type', NEW.type,
      'data', NEW.data
    )
  )
  INTO request_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deliver_email_for_notification_trigger ON public.notifications;
CREATE TRIGGER deliver_email_for_notification_trigger
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.deliver_email_for_notification();

