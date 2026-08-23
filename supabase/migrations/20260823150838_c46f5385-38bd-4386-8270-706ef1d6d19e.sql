-- 1. Adaptive format settings on league rules
ALTER TABLE public.league_rules
  ADD COLUMN IF NOT EXISTS singles_rubbers integer,
  ADD COLUMN IF NOT EXISTS doubles_rubbers integer,
  ADD COLUMN IF NOT EXISTS pairing_policy text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS allow_dual_participation boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.league_rules
    ADD CONSTRAINT league_rules_pairing_policy_check
    CHECK (pairing_policy IN ('fixed','per_fixture'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Season-owned doubles pairs (two REAL players, never a synthetic member)
CREATE TABLE IF NOT EXISTS public.league_team_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  season_id uuid REFERENCES public.league_seasons(id) ON DELETE SET NULL,
  player_one_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  player_two_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  pair_label text,
  pair_order integer,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_team_pairs_distinct_players CHECK (player_one_member_id <> player_two_member_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_team_pairs TO authenticated;
GRANT ALL ON public.league_team_pairs TO service_role;

ALTER TABLE public.league_team_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can view their club pairs"
  ON public.league_team_pairs FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id));

CREATE POLICY "Admins and captains can insert pairs"
  ON public.league_team_pairs FOR INSERT TO authenticated
  WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.is_club_captain(auth.uid(), club_id));

CREATE POLICY "Admins and captains can update pairs"
  ON public.league_team_pairs FOR UPDATE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id) OR public.is_club_captain(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.is_club_captain(auth.uid(), club_id));

CREATE POLICY "Admins and captains can delete pairs"
  ON public.league_team_pairs FOR DELETE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id) OR public.is_club_captain(auth.uid(), club_id));

CREATE INDEX IF NOT EXISTS league_team_pairs_league_idx ON public.league_team_pairs (league_id, season_id);

CREATE TRIGGER update_league_team_pairs_updated_at
  BEFORE UPDATE ON public.league_team_pairs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Multi-rubber result model (singles or doubles rubbers on one fixture)
ALTER TABLE public.league_match_results
  ADD COLUMN IF NOT EXISTS rubber_type text NOT NULL DEFAULT 'singles',
  ADD COLUMN IF NOT EXISTS home_player_member_id uuid,
  ADD COLUMN IF NOT EXISTS away_player_member_id uuid,
  ADD COLUMN IF NOT EXISTS home_player2_member_id uuid,
  ADD COLUMN IF NOT EXISTS away_player2_member_id uuid,
  ADD COLUMN IF NOT EXISTS home_player2_code text,
  ADD COLUMN IF NOT EXISTS away_player2_code text,
  ADD COLUMN IF NOT EXISTS home_player2_name text,
  ADD COLUMN IF NOT EXISTS away_player2_name text,
  ADD COLUMN IF NOT EXISTS participants_locked_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.league_match_results
    ADD CONSTRAINT league_match_results_rubber_type_check
    CHECK (rubber_type IN ('singles','doubles'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Freeze the recorded participants once a rubber has a winner.
CREATE OR REPLACE FUNCTION public.freeze_league_rubber_participants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.winner IS NOT NULL AND NEW.participants_locked_at IS NULL THEN
      NEW.participants_locked_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.participants_locked_at IS NOT NULL THEN
    NEW.home_player_member_id  := OLD.home_player_member_id;
    NEW.away_player_member_id  := OLD.away_player_member_id;
    NEW.home_player2_member_id := OLD.home_player2_member_id;
    NEW.away_player2_member_id := OLD.away_player2_member_id;
    NEW.home_player_code  := OLD.home_player_code;
    NEW.away_player_code  := OLD.away_player_code;
    NEW.home_player_name  := OLD.home_player_name;
    NEW.away_player_name  := OLD.away_player_name;
    NEW.home_player2_code := OLD.home_player2_code;
    NEW.away_player2_code := OLD.away_player2_code;
    NEW.home_player2_name := OLD.home_player2_name;
    NEW.away_player2_name := OLD.away_player2_name;
    NEW.rubber_type := OLD.rubber_type;
    NEW.participants_locked_at := OLD.participants_locked_at;
  ELSIF NEW.winner IS NOT NULL THEN
    NEW.participants_locked_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS freeze_league_rubber_participants_trg ON public.league_match_results;
CREATE TRIGGER freeze_league_rubber_participants_trg
  BEFORE INSERT OR UPDATE ON public.league_match_results
  FOR EACH ROW EXECUTE FUNCTION public.freeze_league_rubber_participants();

-- 4. Line-ups can describe a doubles rubber with a partner
ALTER TABLE public.league_fixture_lineups
  ADD COLUMN IF NOT EXISTS rubber_type text NOT NULL DEFAULT 'singles',
  ADD COLUMN IF NOT EXISTS partner_member_id uuid,
  ADD COLUMN IF NOT EXISTS pair_id uuid REFERENCES public.league_team_pairs(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.league_fixture_lineups
    ADD CONSTRAINT league_fixture_lineups_rubber_type_check
    CHECK (rubber_type IN ('singles','doubles'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;