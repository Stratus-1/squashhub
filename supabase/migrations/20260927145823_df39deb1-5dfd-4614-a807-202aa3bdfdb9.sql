ALTER TABLE public.league_rules
  ADD COLUMN IF NOT EXISTS reserve_mode text NOT NULL DEFAULT 'per_team',
  ADD COLUMN IF NOT EXISTS sub_from_reserves boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sub_from_bye_team boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sub_rank_rule text NOT NULL DEFAULT 'any';
ALTER TABLE public.league_rules DROP CONSTRAINT IF EXISTS league_rules_reserve_mode_chk;
ALTER TABLE public.league_rules ADD CONSTRAINT league_rules_reserve_mode_chk CHECK (reserve_mode IN ('per_team','per_league'));
ALTER TABLE public.league_rules DROP CONSTRAINT IF EXISTS league_rules_sub_rank_rule_chk;
ALTER TABLE public.league_rules ADD CONSTRAINT league_rules_sub_rank_rule_chk CHECK (sub_rank_rule IN ('any','same','same_or_lower'));

-- Pair history: an admin edit closes the old pair and opens a new one.
ALTER TABLE public.league_team_pairs
  ADD COLUMN IF NOT EXISTS effective_from date NOT NULL DEFAULT DATE '2000-01-01',
  ADD COLUMN IF NOT EXISTS effective_to date;
ALTER TABLE public.league_team_pairs ALTER COLUMN effective_from SET DEFAULT current_date;
DROP INDEX IF EXISTS public.league_team_pairs_unique_members_idx;
CREATE UNIQUE INDEX league_team_pairs_unique_members_idx ON public.league_team_pairs
  (league_id, LEAST(player_one_member_id::text, player_two_member_id::text), GREATEST(player_one_member_id::text, player_two_member_id::text))
  WHERE is_active;

CREATE TABLE public.league_reserve_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  association_id uuid NOT NULL,
  season_id uuid,
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  rank integer NOT NULL DEFAULT 1 CHECK (rank BETWEEN 1 AND 20),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_reserve_players TO authenticated;
GRANT ALL ON public.league_reserve_players TO service_role;
ALTER TABLE public.league_reserve_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club members view league reserves" ON public.league_reserve_players FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY "Club admins manage league reserves" ON public.league_reserve_players FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));
CREATE UNIQUE INDEX league_reserve_players_unique_active ON public.league_reserve_players (association_id, COALESCE(season_id, '00000000-0000-0000-0000-000000000000'::uuid), member_id) WHERE is_active;
CREATE TRIGGER update_league_reserve_players_updated_at BEFORE UPDATE ON public.league_reserve_players
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();