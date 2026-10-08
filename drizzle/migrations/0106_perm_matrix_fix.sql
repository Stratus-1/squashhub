CREATE OR REPLACE FUNCTION public.perm_club_matrix(_club_id uuid)
RETURNS TABLE(club_member_id uuid, name text, offices text[], roles text[], caps text[], grants text[], denies text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.club_new_perms_on(_club_id)
     OR NOT public.can_grant(auth.uid(), _club_id, 'permissions.grant') THEN
    RAISE EXCEPTION 'Only the Chairman can view club permissions';
  END IF;
  RETURN QUERY
  WITH people AS (
    SELECT m.id, m.name, m.user_id FROM club_members m
    WHERE m.club_id = _club_id AND (
      m.role = 'admin'
      OR EXISTS (SELECT 1 FROM club_member_permissions cp WHERE cp.club_member_id = m.id)
      OR EXISTS (SELECT 1 FROM club_offices o WHERE o.club_member_id = m.id AND o.club_id = _club_id AND o.ended_at IS NULL)
      OR EXISTS (SELECT 1 FROM member_role_assignments r WHERE r.club_member_id = m.id AND r.club_id = _club_id AND r.revoked_at IS NULL)
      OR EXISTS (SELECT 1 FROM member_capability_overrides c WHERE c.club_member_id = m.id AND c.club_id = _club_id AND c.revoked_at IS NULL))
  )
  SELECT p.id, p.name::text,
    ARRAY(SELECT o.office FROM club_offices o WHERE o.club_member_id = p.id AND o.club_id = _club_id AND o.ended_at IS NULL),
    ARRAY(SELECT r.role_name FROM member_role_assignments r WHERE r.club_member_id = p.id AND r.club_id = _club_id AND r.revoked_at IS NULL),
    CASE WHEN p.user_id IS NULL THEN ARRAY[]::text[] ELSE
      ARRAY(SELECT k.key FROM capability_catalogue k WHERE public.new_model_cap(p.user_id, _club_id, k.key) ORDER BY k.key) END,
    ARRAY(SELECT c.capability_key FROM member_capability_overrides c WHERE c.club_member_id = p.id AND c.club_id = _club_id AND c.revoked_at IS NULL AND c.effect = 'grant'),
    ARRAY(SELECT c.capability_key FROM member_capability_overrides c WHERE c.club_member_id = p.id AND c.club_id = _club_id AND c.revoked_at IS NULL AND c.effect = 'deny')
  FROM people p ORDER BY p.name;
END $$;