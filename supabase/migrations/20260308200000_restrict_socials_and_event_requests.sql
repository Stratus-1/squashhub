-- Restrict who can create "social" events + add event requests (members can request; admins approve/create).

-- 1) Tighten events policies: remove member-created socials.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'Season members can create socials'
  ) THEN
    DROP POLICY "Season members can create socials" ON public.events;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'Creators can update own socials'
  ) THEN
    DROP POLICY "Creators can update own socials" ON public.events;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'Creators can delete own socials'
  ) THEN
    DROP POLICY "Creators can delete own socials" ON public.events;
  END IF;
END $$;

-- 2) Requests table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_request_status') THEN
    CREATE TYPE public.event_request_status AS ENUM ('pending', 'approved', 'declined');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.event_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id uuid REFERENCES public.seasons(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'social' CHECK (kind IN ('social', 'club')),
  title text NOT NULL,
  description text,
  preferred_date date,
  preferred_time time,
  visibility public.event_visibility NOT NULL DEFAULT 'members',
  status public.event_request_status NOT NULL DEFAULT 'pending',
  admin_notes text,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_requests_status_idx ON public.event_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS event_requests_user_idx ON public.event_requests(user_id, created_at DESC);

ALTER TABLE public.event_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_requests' AND policyname = 'Users can view own event requests'
  ) THEN
    CREATE POLICY "Users can view own event requests"
      ON public.event_requests FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_requests' AND policyname = 'Users can create event requests'
  ) THEN
    CREATE POLICY "Users can create event requests"
      ON public.event_requests FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_requests' AND policyname = 'Users can withdraw own pending requests'
  ) THEN
    CREATE POLICY "Users can withdraw own pending requests"
      ON public.event_requests FOR DELETE TO authenticated
      USING (auth.uid() = user_id AND status = 'pending'::public.event_request_status);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'event_requests' AND policyname = 'Admins can manage event requests'
  ) THEN
    CREATE POLICY "Admins can manage event requests"
      ON public.event_requests FOR ALL TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()))
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_event_requests_updated_at ON public.event_requests;
CREATE TRIGGER update_event_requests_updated_at
  BEFORE UPDATE ON public.event_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Notify admins + requester when a request is created
CREATE OR REPLACE FUNCTION public.notify_on_event_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pname text;
  admin_id uuid;
BEGIN
  SELECT p.name INTO pname FROM public.profiles p WHERE p.id = NEW.user_id;
  pname := COALESCE(NULLIF(pname, ''), 'A player');

  -- Ack to requester
  INSERT INTO public.notifications (user_id, title, message, type, url, data)
  VALUES (
    NEW.user_id,
    'Event request submitted',
    'Thanks! Your request "' || NEW.title || '" was sent to the club admins.',
    'marketing',
    '/events',
    jsonb_build_object('event_request_id', NEW.id)
  );

  -- Notify admins/managers
  FOR admin_id IN
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin'::public.app_role, 'moderator'::public.app_role)
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    VALUES (
      admin_id,
      'New event request',
      pname || ' requested: ' || NEW.title,
      'admin',
      '/admin',
      jsonb_build_object('event_request_id', NEW.id, 'requester_id', NEW.user_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_event_request_insert_trigger ON public.event_requests;
CREATE TRIGGER notify_on_event_request_insert_trigger
  AFTER INSERT ON public.event_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_event_request_insert();

