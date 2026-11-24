CREATE OR REPLACE FUNCTION public.junior_contacts_for(_org_id uuid)
RETURNS TABLE(member_id uuid, phone text, email text, parent_name text, parent_phone text, parent_email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_platform_admin(uid) OR public.is_national_admin(uid) OR public.federation_can_manage_org(uid, _org_id)) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT cm.id, cm.phone::text, cm.email::text, r.parent_name::text, r.parent_phone::text, r.parent_email::text
  FROM public.club_members cm
  LEFT JOIN LATERAL (
    SELECT j.parent_name, j.parent_phone, j.parent_email FROM public.junior_reg_requests j
    WHERE j.club_member_id = cm.id AND (j.parent_phone IS NOT NULL OR j.parent_email IS NOT NULL)
    ORDER BY j.created_at DESC LIMIT 1) r ON true
  WHERE cm.club_id IN (SELECT g.club_id FROM public.org_grouping_club_ids(_org_id) g)
    AND cm.id IN (SELECT s.member_id FROM public.junior_squads_for(NULL, _org_id) s);
END $$;
REVOKE ALL ON FUNCTION public.junior_contacts_for(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.junior_contacts_for(uuid) TO authenticated;