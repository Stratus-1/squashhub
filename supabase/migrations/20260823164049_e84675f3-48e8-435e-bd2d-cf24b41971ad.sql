WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY league_id,
             least(player_one_member_id::text, player_two_member_id::text),
             greatest(player_one_member_id::text, player_two_member_id::text)
           ORDER BY created_at, id
         ) AS rn
  FROM public.league_team_pairs
)
DELETE FROM public.league_team_pairs p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

UPDATE public.league_team_pairs p
SET season_id = l.season_id,
    updated_at = now()
FROM public.leagues l
WHERE l.id = p.league_id
  AND p.season_id IS DISTINCT FROM l.season_id;

CREATE OR REPLACE FUNCTION public.validate_league_team_pair_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_season_id uuid;
BEGIN
  SELECT club_id, season_id
  INTO v_club_id, v_season_id
  FROM public.leagues
  WHERE id = NEW.league_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'The selected team does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE id = NEW.player_one_member_id AND club_id = v_club_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE id = NEW.player_two_member_id AND club_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'Both players must belong to the team club';
  END IF;

  NEW.club_id := v_club_id;
  NEW.season_id := v_season_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_league_team_pair_scope_trg ON public.league_team_pairs;
CREATE TRIGGER validate_league_team_pair_scope_trg
BEFORE INSERT OR UPDATE OF league_id, club_id, season_id, player_one_member_id, player_two_member_id
ON public.league_team_pairs
FOR EACH ROW EXECUTE FUNCTION public.validate_league_team_pair_scope();

CREATE UNIQUE INDEX IF NOT EXISTS league_team_pairs_unique_members_idx
ON public.league_team_pairs (
  league_id,
  least(player_one_member_id::text, player_two_member_id::text),
  greatest(player_one_member_id::text, player_two_member_id::text)
);