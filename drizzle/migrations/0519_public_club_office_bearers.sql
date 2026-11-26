CREATE OR REPLACE FUNCTION public.get_club_office_bearers_public(_club_id uuid)
RETURNS TABLE(id uuid, name text, office text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT cm.id, cm.name::text, x.office
  FROM public.clubs c
  CROSS JOIN LATERAL (VALUES
    (1, 'Chairman'::text, c.chairman_member_id),
    (2, 'Vice Chairman'::text, c.vice_chairman_member_id),
    (3, 'Secretary'::text, c.secretary_member_id),
    (4, 'Treasurer'::text, c.treasurer_member_id),
    (5, 'Captain'::text, c.club_captain_member_id),
    (6, 'Club Manager'::text, c.club_manager_member_id)
  ) AS x(position, office, member_id)
  JOIN public.club_members cm ON cm.id = x.member_id AND cm.club_id = c.id
  WHERE c.id = _club_id AND c.show_delegates_on_landing IS DISTINCT FROM false
  ORDER BY x.position;
$function$;
REVOKE ALL ON FUNCTION public.get_club_office_bearers_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_club_office_bearers_public(uuid) TO anon, authenticated, service_role;