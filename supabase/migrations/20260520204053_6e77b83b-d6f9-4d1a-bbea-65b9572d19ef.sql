CREATE OR REPLACE FUNCTION public.admin_list_unclaimed_club_members(_club_id uuid)
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
  SELECT
    cm.id AS member_id,
    cm.name AS full_name,
    maa.league_association_number AS nsa_number,
    (
      SELECT l.name FROM public.member_league_registrations mlr
      JOIN public.leagues l ON l.id = mlr.league_id
      WHERE mlr.club_member_id = cm.id
      ORDER BY mlr.created_at DESC NULLS LAST
      LIMIT 1
    ) AS league_name,
    c.subdomain AS club_subdomain,
    cm.phone,
    cm.email
  FROM public.club_members cm
  JOIN public.clubs c ON c.id = cm.club_id
  LEFT JOIN public.member_association_affiliations maa
    ON maa.club_member_id = cm.id AND maa.active = true
  WHERE cm.club_id = _club_id
    AND cm.user_id IS NULL
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.club_members me
        WHERE me.user_id = auth.uid()
          AND me.club_id = _club_id
          AND me.role = 'admin'
      )
    )
  ORDER BY cm.name;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_unclaimed_club_members(uuid) TO authenticated;