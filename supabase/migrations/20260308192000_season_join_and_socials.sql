-- Season join + season socials
-- Goals:
-- - Allow members to "join" the active season (season_memberships)
-- - Notify users when a new season starts (notifications + push)
-- - Allow season members to create small socials (stored as events.kind='social') and RSVP

-- 1) Season memberships
CREATE TABLE IF NOT EXISTS public.season_memberships (
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id)
);

CREATE INDEX IF NOT EXISTS season_memberships_user_idx
  ON public.season_memberships(user_id);

ALTER TABLE public.season_memberships ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'season_memberships' AND policyname = 'Users can view own season memberships'
  ) THEN
    CREATE POLICY "Users can view own season memberships"
      ON public.season_memberships FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'season_memberships' AND policyname = 'Users can join a season'
  ) THEN
    CREATE POLICY "Users can join a season"
      ON public.season_memberships FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'season_memberships' AND policyname = 'Users can leave a season'
  ) THEN
    CREATE POLICY "Users can leave a season"
      ON public.season_memberships FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'season_memberships' AND policyname = 'Admins can view all season memberships'
  ) THEN
    CREATE POLICY "Admins can view all season memberships"
      ON public.season_memberships FOR SELECT TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()));
  END IF;
END $$;

-- 2) Convenience RPCs
CREATE OR REPLACE FUNCTION public.join_active_season()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  sid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO sid FROM public.seasons WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
  IF sid IS NULL THEN
    RAISE EXCEPTION 'No active season';
  END IF;

  INSERT INTO public.season_memberships (season_id, user_id)
  VALUES (sid, uid)
  ON CONFLICT DO NOTHING;

  RETURN sid;
END;
$$;

REVOKE ALL ON FUNCTION public.join_active_season() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_active_season() TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_active_season()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  sid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO sid FROM public.seasons WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
  IF sid IS NULL THEN
    RAISE EXCEPTION 'No active season';
  END IF;

  DELETE FROM public.season_memberships
  WHERE season_id = sid AND user_id = uid;

  RETURN sid;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_active_season() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_active_season() TO authenticated;

-- 3) Add season + kind to events (so "socials" can be created by members)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS season_id uuid REFERENCES public.seasons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'club' CHECK (kind IN ('club', 'social'));

CREATE INDEX IF NOT EXISTS events_season_idx ON public.events(season_id);
CREATE INDEX IF NOT EXISTS events_kind_idx ON public.events(kind);

-- Allow season members to create "social" events (members-only, published).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'Season members can create socials'
  ) THEN
    CREATE POLICY "Season members can create socials"
      ON public.events FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = created_by
        AND kind = 'social'
        AND status = 'published'::public.event_status
        AND visibility = 'members'::public.event_visibility
        AND season_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.season_memberships sm
          WHERE sm.season_id = season_id
            AND sm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'Creators can update own socials'
  ) THEN
    CREATE POLICY "Creators can update own socials"
      ON public.events FOR UPDATE TO authenticated
      USING (auth.uid() = created_by AND kind = 'social')
      WITH CHECK (
        auth.uid() = created_by
        AND kind = 'social'
        AND visibility = 'members'::public.event_visibility
        AND season_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.season_memberships sm
          WHERE sm.season_id = season_id
            AND sm.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'Creators can delete own socials'
  ) THEN
    CREATE POLICY "Creators can delete own socials"
      ON public.events FOR DELETE TO authenticated
      USING (auth.uid() = created_by AND kind = 'social');
  END IF;
END $$;

-- 4) Notify users when a new season starts
CREATE OR REPLACE FUNCTION public.notify_on_new_season()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only for active seasons
  IF NEW.is_active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- Avoid duplicates if re-applied
  INSERT INTO public.notifications (user_id, title, message, type, url, data)
  SELECT
    p.id,
    'New season started',
    'The new season "' || NEW.name || '" has started. Join the season to take part.',
    'season',
    '/seasons',
    jsonb_build_object('season_id', NEW.id)
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = p.id
      AND n.type = 'season'
      AND (n.data->>'season_id') = NEW.id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_new_season_trigger ON public.seasons;
CREATE TRIGGER notify_on_new_season_trigger
  AFTER INSERT ON public.seasons
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_season();

-- 5) Realtime publication (for live sync)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'season_memberships') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.season_memberships;
    END IF;
  END IF;
END $$;
