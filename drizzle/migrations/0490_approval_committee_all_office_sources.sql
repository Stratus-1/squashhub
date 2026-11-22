CREATE OR REPLACE FUNCTION public._approval_member_offices(p_member uuid, p_club uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT string_agg(o, ', ' ORDER BY array_position(ARRAY['chairman','vice_chair','secretary','treasurer','club_captain','club_manager'], o))
  FROM (
    SELECT DISTINCT o FROM (
      SELECT co.office AS o FROM club_offices co
        WHERE co.club_member_id = p_member AND co.club_id = p_club AND co.ended_at IS NULL
      UNION ALL
      SELECT x.o FROM clubs c CROSS JOIN LATERAL (VALUES
          ('chairman', c.chairman_member_id), ('vice_chair', c.vice_chairman_member_id),
          ('secretary', c.secretary_member_id), ('treasurer', c.treasurer_member_id),
          ('club_captain', c.club_captain_member_id), ('club_manager', c.club_manager_member_id)) AS x(o, mid)
        WHERE c.id = p_club AND x.mid = p_member
      UNION ALL
      SELECT CASE lower(trim(r.role_name))
          WHEN 'chairman' THEN 'chairman' WHEN 'vice-chairman' THEN 'vice_chair' WHEN 'vice chairman' THEN 'vice_chair'
          WHEN 'secretary' THEN 'secretary' WHEN 'treasurer' THEN 'treasurer'
          WHEN 'club captain' THEN 'club_captain' WHEN 'captain' THEN 'club_captain'
          WHEN 'club manager' THEN 'club_manager' END
        FROM club_member_permissions p JOIN club_permission_roles r ON r.id = p.permission_role_id AND r.club_id = p_club
        WHERE p.club_member_id = p_member
    ) s WHERE o IS NOT NULL
  ) d
$$;

CREATE OR REPLACE FUNCTION public._approval_is_eligible_member(p_member uuid, p_club uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM club_members m
    WHERE m.id = p_member AND m.club_id = p_club
      AND COALESCE(m.status::text, 'active') = 'active'
      AND (m.role::text = 'admin' OR public._approval_member_offices(m.id, p_club) IS NOT NULL))
$$;

CREATE OR REPLACE FUNCTION public.approval_eligible_members(p_club uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_use_club_approvals(p_club) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('member_id', m.id, 'name', m.name,
      'office', public._approval_member_offices(m.id, p_club),
      'is_admin', m.role::text = 'admin', 'has_email', COALESCE(trim(m.email), '') <> '') ORDER BY m.name)
    FROM club_members m WHERE m.club_id = p_club AND public._approval_is_eligible_member(m.id, p_club)), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.approval_list(p_club uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_use_club_approvals(p_club) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN jsonb_build_object(
    'my_member_ids', COALESCE((SELECT jsonb_agg(id) FROM club_members WHERE club_id = p_club AND user_id = auth.uid()), '[]'::jsonb),
    'requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'topic', r.topic, 'description', r.description, 'amount', r.amount, 'status', r.status,
        'created_at', r.created_at, 'decided_at', r.decided_at, 'requester_member_id', r.requester_member_id,
        'requester_name', rm.name, 'requester_signature_path', r.requester_signature_path,
        'approvers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'member_id', a.member_id, 'name', am.name,
            'office', public._approval_member_offices(a.member_id, p_club),
            'status', a.status, 'signature_path', a.signature_path, 'signed_at', a.signed_at, 'signed_via', a.signed_via,
            'decline_reason', a.decline_reason) ORDER BY a.created_at)
          FROM club_approval_approvers a JOIN club_members am ON am.id = a.member_id WHERE a.request_id = r.id), '[]'::jsonb),
        'attachments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'path', f.path, 'file_name', f.file_name, 'mime_type', f.mime_type, 'size_bytes', f.size_bytes) ORDER BY f.created_at)
          FROM club_approval_attachments f WHERE f.request_id = r.id), '[]'::jsonb),
        'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', e.kind, 'note', e.note, 'created_at', e.created_at, 'actor_name', em.name) ORDER BY e.created_at)
          FROM club_approval_events e LEFT JOIN club_members em ON em.id = e.actor_member_id WHERE e.request_id = r.id), '[]'::jsonb)
      ) ORDER BY r.created_at DESC)
      FROM club_approval_requests r JOIN club_members rm ON rm.id = r.requester_member_id
      WHERE r.club_id = p_club), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public._approval_member_offices(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._approval_member_offices(uuid, uuid) TO authenticated, service_role;