
CREATE OR REPLACE FUNCTION public.captain_list_unclaimed_teammates(_club_member_id uuid)
RETURNS TABLE(
  member_id uuid,
  full_name text,
  nsa_number text,
  league_name text,
  club_subdomain text,
  phone text,
  email text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH captain_leagues AS (
    SELECT DISTINCT mlr.league_id
    FROM public.member_league_registrations mlr
    WHERE mlr.club_member_id = _club_member_id
      AND mlr.is_captain = true
  ),
  teammates AS (
    SELECT DISTINCT
      cm.id AS member_id,
      cm.name AS full_name,
      cm.club_id,
      cm.phone,
      cm.email,
      l.name AS league_name
    FROM captain_leagues cl
    JOIN public.member_league_registrations mlr ON mlr.league_id = cl.league_id
    JOIN public.club_members cm ON cm.id = mlr.club_member_id
    JOIN public.leagues l ON l.id = mlr.league_id
    WHERE cm.id <> _club_member_id
      AND cm.user_id IS NULL
  )
  SELECT
    t.member_id,
    t.full_name,
    maa.league_association_number AS nsa_number,
    t.league_name,
    c.subdomain AS club_subdomain,
    t.phone,
    t.email
  FROM teammates t
  JOIN public.clubs c ON c.id = t.club_id
  LEFT JOIN public.member_association_affiliations maa
    ON maa.club_member_id = t.member_id AND maa.active = true
  WHERE EXISTS (
    SELECT 1 FROM public.club_members me
    WHERE me.id = _club_member_id
      AND me.user_id = auth.uid()
  )
  ORDER BY t.league_name, t.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.captain_list_unclaimed_teammates(uuid) TO authenticated;
