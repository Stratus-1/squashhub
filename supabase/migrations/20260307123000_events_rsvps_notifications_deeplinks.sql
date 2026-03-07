-- Events + RSVPs + marketing/broadcast support
-- - public.events (admin-managed)
-- - public.event_rsvps (user-managed)
-- - notifications: add deep-link url + data jsonb
-- - push trigger: use notifications.url instead of hardcoded /notifications

-- 1) Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_visibility') THEN
    CREATE TYPE public.event_visibility AS ENUM ('public', 'members');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
    CREATE TYPE public.event_status AS ENUM ('draft', 'published', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_rsvp_status') THEN
    CREATE TYPE public.event_rsvp_status AS ENUM ('going', 'maybe', 'not_going');
  END IF;
END $$;

-- 2) Events
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text,
  court_id integer REFERENCES public.courts(id),
  capacity integer CHECK (capacity IS NULL OR capacity >= 1),
  rsvp_deadline timestamptz,
  visibility public.event_visibility NOT NULL DEFAULT 'members',
  status public.event_status NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Authenticated users can see published events (both visibilities); admins can see everything.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'Events viewable by authenticated'
  ) THEN
    CREATE POLICY "Events viewable by authenticated"
      ON public.events FOR SELECT TO authenticated
      USING (
        (status = 'published'::public.event_status)
        OR public.is_admin_or_moderator(auth.uid())
      );
  END IF;

  -- Anonymous users can see published public events.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'Public events viewable by anon'
  ) THEN
    CREATE POLICY "Public events viewable by anon"
      ON public.events FOR SELECT TO anon
      USING (status = 'published'::public.event_status AND visibility = 'public'::public.event_visibility);
  END IF;

  -- Admins/managers can manage events.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'Admins can manage events'
  ) THEN
    CREATE POLICY "Admins can manage events"
      ON public.events FOR ALL TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()))
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_events_updated_at ON public.events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) RSVPs
CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.event_rsvp_status NOT NULL,
  guests integer NOT NULL DEFAULT 0 CHECK (guests >= 0 AND guests <= 20),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_rsvps' AND policyname = 'Users can view own event RSVPs'
  ) THEN
    CREATE POLICY "Users can view own event RSVPs"
      ON public.event_rsvps FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_rsvps' AND policyname = 'Admins can view all event RSVPs'
  ) THEN
    CREATE POLICY "Admins can view all event RSVPs"
      ON public.event_rsvps FOR SELECT TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_rsvps' AND policyname = 'Users can RSVP to visible events'
  ) THEN
    CREATE POLICY "Users can RSVP to visible events"
      ON public.event_rsvps FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1
          FROM public.events e
          WHERE e.id = event_id
            AND e.status = 'published'::public.event_status
            AND (e.visibility IN ('public'::public.event_visibility, 'members'::public.event_visibility))
            AND (e.rsvp_deadline IS NULL OR e.rsvp_deadline >= now())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_rsvps' AND policyname = 'Users can update own RSVP'
  ) THEN
    CREATE POLICY "Users can update own RSVP"
      ON public.event_rsvps FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_rsvps' AND policyname = 'Users can delete own RSVP'
  ) THEN
    CREATE POLICY "Users can delete own RSVP"
      ON public.event_rsvps FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_rsvps' AND policyname = 'Admins can manage RSVPs'
  ) THEN
    CREATE POLICY "Admins can manage RSVPs"
      ON public.event_rsvps FOR ALL TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()))
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_event_rsvps_updated_at ON public.event_rsvps;
CREATE TRIGGER update_event_rsvps_updated_at
  BEFORE UPDATE ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS event_rsvps_event_status_idx ON public.event_rsvps(event_id, status);

-- 4) RSVP counts RPC (so UIs can show counts without exposing attendee lists)
CREATE OR REPLACE FUNCTION public.get_event_rsvp_counts(target_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.events%ROWTYPE;
  can_view boolean := false;
  going_count integer := 0;
  maybe_count integer := 0;
  not_count integer := 0;
  guests_total integer := 0;
BEGIN
  SELECT * INTO e FROM public.events WHERE id = target_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Visibility rules: published public can be viewed by anyone; members events require auth; admins can view all.
  IF e.status = 'published'::public.event_status AND e.visibility = 'public'::public.event_visibility THEN
    can_view := true;
  ELSIF auth.uid() IS NOT NULL AND e.status = 'published'::public.event_status THEN
    can_view := true;
  ELSIF auth.uid() IS NOT NULL AND public.is_admin_or_moderator(auth.uid()) THEN
    can_view := true;
  END IF;

  IF NOT can_view THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT
    count(*) FILTER (WHERE status = 'going'::public.event_rsvp_status)::int,
    count(*) FILTER (WHERE status = 'maybe'::public.event_rsvp_status)::int,
    count(*) FILTER (WHERE status = 'not_going'::public.event_rsvp_status)::int,
    COALESCE(sum(guests) FILTER (WHERE status IN ('going'::public.event_rsvp_status, 'maybe'::public.event_rsvp_status)), 0)::int
  INTO going_count, maybe_count, not_count, guests_total
  FROM public.event_rsvps
  WHERE event_id = target_event_id;

  RETURN jsonb_build_object(
    'going', going_count,
    'maybe', maybe_count,
    'not_going', not_count,
    'guests_total', guests_total,
    'total', (going_count + maybe_count + not_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_event_rsvp_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_rsvp_counts(uuid) TO anon, authenticated;

-- 5) Notifications deep-link + metadata
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS url text NOT NULL DEFAULT '/notifications',
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 6) Update the push trigger to use notifications.url (instead of hardcoding /notifications)
-- (Function is defined in an earlier migration; we replace it here.)
CREATE OR REPLACE FUNCTION public.deliver_web_push_for_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  internal_secret text;
  request_id bigint;
BEGIN
  SELECT value
  INTO internal_secret
  FROM public.app_settings
  WHERE key = 'push_private_internal_secret';

  IF internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := 'https://awbrbrcdowoxsvarhzeg.supabase.co/functions/v1/push-notifications?action=send',
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
      'icon', '/pwa-192x192.png',
      'data', NEW.data
    )
  )
  INTO request_id;

  RETURN NEW;
END;
$$;

