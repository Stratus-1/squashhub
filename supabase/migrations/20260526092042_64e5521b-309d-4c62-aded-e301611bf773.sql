CREATE OR REPLACE FUNCTION public.get_team_captain_codes(_team_codes text[])
RETURNS TABLE(team_code text, captain_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH leagues_in AS (
    SELECT l.id, upper(l.code) AS code, l.captain_member_id
    FROM public.leagues l
    WHERE upper(l.code) = ANY (SELECT upper(c) FROM unnest(_team_codes) c)
  ),
  -- Prefer captain stored on leagues.captain_member_id, fall back to is_captain reg
  resolved AS (
    SELECT li.code AS team_code,
           COALESCE(
             li.captain_member_id,
             (SELECT mlr.club_member_id FROM public.member_league_registrations mlr
              WHERE mlr.league_id = li.id AND mlr.is_captain = true LIMIT 1)
           ) AS captain_member_id,
           li.id AS league_id
    FROM leagues_in li
  )
  SELECT r.team_code,
         COALESCE(
           NULLIF((SELECT (mlr.league_association_number) FROM public.member_league_registrations mlr
                   WHERE mlr.club_member_id = r.captain_member_id AND mlr.league_id = r.league_id
                   LIMIT 1), ''),
           NULLIF((SELECT mlr.ssa_number FROM public.member_league_registrations mlr
                   WHERE mlr.club_member_id = r.captain_member_id AND mlr.league_id = r.league_id
                   LIMIT 1), ''),
           NULLIF((SELECT cm.club_member_number FROM public.club_members cm
                   WHERE cm.id = r.captain_member_id LIMIT 1), '')
         )::text AS captain_code
  FROM resolved r
  WHERE r.captain_member_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_captain_codes(text[]) TO authenticated, anon;