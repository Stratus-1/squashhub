-- Season management for ladder play.
-- - Start/end seasons
-- - Archive the ladder + stats at season end
-- - Optionally reset ladder ranks/stats for a new season

CREATE TABLE IF NOT EXISTS public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active_idx
  ON public.seasons (is_active)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.season_profiles (
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank integer,
  matches_played integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  form_last5 text NOT NULL DEFAULT '',
  last_competitive_match_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, user_id)
);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'seasons' AND policyname = 'Seasons viewable by authenticated'
  ) THEN
    CREATE POLICY "Seasons viewable by authenticated"
      ON public.seasons FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'seasons' AND policyname = 'Admins can manage seasons'
  ) THEN
    CREATE POLICY "Admins can manage seasons"
      ON public.seasons FOR ALL TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()))
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'season_profiles' AND policyname = 'Season snapshots viewable by authenticated'
  ) THEN
    CREATE POLICY "Season snapshots viewable by authenticated"
      ON public.season_profiles FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'season_profiles' AND policyname = 'Admins can manage season snapshots'
  ) THEN
    CREATE POLICY "Admins can manage season snapshots"
      ON public.season_profiles FOR ALL TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()))
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;
END $$;

-- Start a new season (admin/moderator). If an active season exists, it is ended (without resets) first.
CREATE OR REPLACE FUNCTION public.admin_start_season(season_name text, starts_on date DEFAULT current_date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  existing uuid;
  new_id uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL OR NOT public.is_admin_or_moderator(uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id INTO existing FROM public.seasons WHERE is_active = true LIMIT 1;
  IF existing IS NOT NULL THEN
    UPDATE public.seasons
    SET is_active = false, ends_on = COALESCE(ends_on, starts_on - 1)
    WHERE id = existing;
  END IF;

  INSERT INTO public.seasons (name, starts_on, is_active, created_by)
  VALUES (season_name, starts_on, true, uid)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_start_season(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_start_season(text, date) TO authenticated;

-- End the active season, archive ladder snapshot, and optionally reset ladder/stats.
CREATE OR REPLACE FUNCTION public.admin_end_active_season(reset_stats boolean DEFAULT true, reset_ranks boolean DEFAULT false)
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
  IF uid IS NULL OR NOT public.is_admin_or_moderator(uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id INTO sid FROM public.seasons WHERE is_active = true LIMIT 1;
  IF sid IS NULL THEN
    RAISE EXCEPTION 'No active season';
  END IF;

  UPDATE public.seasons
  SET is_active = false, ends_on = current_date
  WHERE id = sid;

  INSERT INTO public.season_profiles (season_id, user_id, rank, matches_played, wins, losses, form_last5, last_competitive_match_at)
  SELECT
    sid,
    p.id,
    p.rank,
    COALESCE(p.matches_played, 0),
    COALESCE(p.wins, 0),
    COALESCE(p.losses, 0),
    COALESCE(p.form_last5, ''),
    p.last_competitive_match_at
  FROM public.profiles p
  ON CONFLICT (season_id, user_id) DO NOTHING;

  IF reset_stats IS TRUE THEN
    UPDATE public.profiles
    SET
      matches_played = 0,
      wins = 0,
      losses = 0,
      form_last5 = '',
      last_competitive_match_at = NULL,
      updated_at = now();
  END IF;

  IF reset_ranks IS TRUE THEN
    UPDATE public.profiles
    SET rank = NULL, updated_at = now()
    WHERE rank IS NOT NULL;
  END IF;

  RETURN sid;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_end_active_season(boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_end_active_season(boolean, boolean) TO authenticated;

