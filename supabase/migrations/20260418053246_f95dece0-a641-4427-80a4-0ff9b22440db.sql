-- 1. Club-level settings
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS fill_top_down_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS league_week_start_dow integer NOT NULL DEFAULT 3 CHECK (league_week_start_dow BETWEEN 0 AND 6);

-- 2. League-level cross-gender flag (leagues table is in extended schema, not in types — use IF EXISTS guard)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leagues') THEN
    EXECUTE 'ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS allow_cross_gender_guests boolean NOT NULL DEFAULT false';
    EXECUTE 'ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS captain_member_id uuid';
  END IF;
END $$;

-- 3. league_week_lineups: snapshot per (club, league, week_start_date, position)
CREATE TABLE IF NOT EXISTS public.league_week_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  league_id uuid NOT NULL,
  week_start_date date NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 8),
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  is_guest boolean NOT NULL DEFAULT false,
  guest_from_league_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, week_start_date, position)
);

CREATE INDEX IF NOT EXISTS idx_lwl_club_week ON public.league_week_lineups (club_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_lwl_league_week ON public.league_week_lineups (league_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_lwl_member ON public.league_week_lineups (club_member_id, week_start_date);

-- 4. league_week_player_status: tracks unavailable / excess per player per week
CREATE TABLE IF NOT EXISTS public.league_week_player_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  league_id uuid NOT NULL,
  week_start_date date NOT NULL,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('playing','unavailable','excess')),
  cascaded_from_league_id uuid,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, week_start_date, club_member_id)
);

CREATE INDEX IF NOT EXISTS idx_lwps_club_week ON public.league_week_player_status (club_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_lwps_league_week ON public.league_week_player_status (league_id, week_start_date);

-- 5. updated_at triggers
DROP TRIGGER IF EXISTS trg_lwl_touch ON public.league_week_lineups;
CREATE TRIGGER trg_lwl_touch
BEFORE UPDATE ON public.league_week_lineups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_lwps_touch ON public.league_week_player_status;
CREATE TRIGGER trg_lwps_touch
BEFORE UPDATE ON public.league_week_player_status
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Helper: is this user the captain of this league? (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_league_captain(_user_id uuid, _league_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leagues l
    JOIN public.club_members cm ON cm.id = l.captain_member_id
    WHERE l.id = _league_id
      AND cm.user_id = _user_id
  );
$$;

-- 7. Helper: is this user any registered league player in this club?
CREATE OR REPLACE FUNCTION public.is_club_league_player(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = _user_id
      AND cm.club_id = _club_id
      AND cm.plays_league = true
  );
$$;

-- 8. RLS
ALTER TABLE public.league_week_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_week_player_status ENABLE ROW LEVEL SECURITY;

-- Lineups: view = league players or admins; modify = league captain or club admin
DROP POLICY IF EXISTS "league players view lineups" ON public.league_week_lineups;
CREATE POLICY "league players view lineups"
ON public.league_week_lineups FOR SELECT TO authenticated
USING (is_club_league_player(auth.uid(), club_id) OR is_club_admin(auth.uid(), club_id));

DROP POLICY IF EXISTS "captain or admin manages lineups" ON public.league_week_lineups;
CREATE POLICY "captain or admin manages lineups"
ON public.league_week_lineups FOR ALL TO authenticated
USING (is_league_captain(auth.uid(), league_id) OR is_club_admin(auth.uid(), club_id))
WITH CHECK (is_league_captain(auth.uid(), league_id) OR is_club_admin(auth.uid(), club_id));

-- Player status: same policy
DROP POLICY IF EXISTS "league players view status" ON public.league_week_player_status;
CREATE POLICY "league players view status"
ON public.league_week_player_status FOR SELECT TO authenticated
USING (is_club_league_player(auth.uid(), club_id) OR is_club_admin(auth.uid(), club_id));

DROP POLICY IF EXISTS "captain or admin manages status" ON public.league_week_player_status;
CREATE POLICY "captain or admin manages status"
ON public.league_week_player_status FOR ALL TO authenticated
USING (is_league_captain(auth.uid(), league_id) OR is_club_admin(auth.uid(), club_id))
WITH CHECK (is_league_captain(auth.uid(), league_id) OR is_club_admin(auth.uid(), club_id));