-- Mobile resolvers: add a read-only `inactiveMemberships` diagnostic list.
--
-- Additive only. `memberships`, `linkedMemberIds`, `linkedMemberships`,
-- `userId`, `isPlatformAdmin` and every authorization filter are unchanged.
-- `inactiveMemberships` lists club_members rows that are NOT selectable under
-- the existing active filters and that belong to the verified caller: rows
-- whose user_id is the caller's exact auth user id, or whose email exactly
-- matches the verified email (the same-email family link model). No other
-- member's rows are returned. Each entry is { clubId, clubName, memberId, status }
-- where status explains why the row is not selectable (resigned, suspended,
-- pending, manual_hold, ...). Nothing is written.

CREATE OR REPLACE FUNCTION public.mobile_resolve_auth_user_club_access(p_sync_secret text, p_auth_user_id uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_user_id uuid; v_memberships jsonb := '[]'::jsonb; v_linked jsonb := '[]'::jsonb; v_admin boolean := false; v_inactive jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  SELECT u.id INTO v_user_id FROM auth.users u
    WHERE u.id=p_auth_user_id AND lower(u.email)=lower(trim(p_email)) AND u.email_confirmed_at IS NOT NULL LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Verified account required' USING ERRCODE='42501'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=v_user_id AND ur.role IN ('admin','moderator')) INTO v_admin;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('clubId',own.club_id,'memberId',own.id,'role',own.role) ORDER BY own.club_id),'[]'::jsonb)
    INTO v_memberships FROM (
      SELECT DISTINCT ON(cm.club_id) cm.id,cm.club_id,cm.role FROM public.club_members cm
      WHERE cm.user_id=v_user_id AND COALESCE(cm.is_pending_approval,false)=false AND cm.access_suspended_at IS NULL
        AND COALESCE(cm.suspension_status::text,'') NOT IN ('suspended','manual_hold','blocked','revoked')
      AND lower(COALESCE(cm.status::text,'active')) NOT IN ('inactive','suspended','blocked','disabled','cancelled','canceled','resigned','deleted','rejected','pending','pending_approval','application','requested','expired')
      ORDER BY cm.club_id,cm.joined_at ASC NULLS LAST,cm.id ASC
    ) own;
  SELECT COALESCE(jsonb_agg(linked.id ORDER BY linked.club_id,linked.id),'[]'::jsonb) INTO v_linked
    FROM public.club_members linked WHERE lower(COALESCE(linked.email,''))=lower(trim(p_email))
      AND COALESCE(linked.is_pending_approval,false)=false AND linked.access_suspended_at IS NULL
      AND COALESCE(linked.suspension_status::text,'') NOT IN ('suspended','manual_hold','blocked','revoked')
      AND lower(COALESCE(linked.status::text,'active')) NOT IN ('inactive','suspended','blocked','disabled','cancelled','canceled','resigned','deleted','rejected','pending','pending_approval','application','requested','expired')
      AND EXISTS(SELECT 1 FROM public.club_members own WHERE own.user_id=v_user_id AND own.club_id=linked.club_id
        AND COALESCE(own.is_pending_approval,false)=false AND own.access_suspended_at IS NULL
        AND COALESCE(own.suspension_status::text,'') NOT IN ('suspended','manual_hold','blocked','revoked')
        AND lower(COALESCE(own.status::text,'active')) NOT IN ('inactive','suspended','blocked','disabled','cancelled','canceled','resigned','deleted','rejected','pending','pending_approval','application','requested','expired'));
  -- Diagnostic only: the caller's own rows (exact user id) and exact same-email
  -- rows that fail the active filters above. Never other members.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('clubId',d.club_id,'clubName',d.club_name,'memberId',d.id,'status',d.reason) ORDER BY d.club_name,d.club_id,d.id),'[]'::jsonb)
    INTO v_inactive FROM (
      SELECT cm.id, cm.club_id, c.name AS club_name,
        CASE
          WHEN lower(COALESCE(cm.status::text,'active')) IN ('inactive','suspended','blocked','disabled','cancelled','canceled','resigned','deleted','rejected','pending','pending_approval','application','requested','expired') THEN lower(cm.status::text)
          WHEN COALESCE(cm.is_pending_approval,false) THEN 'pending'
          WHEN COALESCE(cm.suspension_status::text,'') IN ('suspended','manual_hold','blocked','revoked') THEN cm.suspension_status::text
          WHEN cm.access_suspended_at IS NOT NULL THEN 'suspended'
          ELSE 'inactive'
        END AS reason
      FROM public.club_members cm
      LEFT JOIN public.clubs c ON c.id=cm.club_id
      WHERE (cm.user_id=v_user_id OR lower(COALESCE(cm.email,''))=lower(trim(p_email)))
        AND NOT (COALESCE(cm.is_pending_approval,false)=false AND cm.access_suspended_at IS NULL
          AND COALESCE(cm.suspension_status::text,'') NOT IN ('suspended','manual_hold','blocked','revoked')
          AND lower(COALESCE(cm.status::text,'active')) NOT IN ('inactive','suspended','blocked','disabled','cancelled','canceled','resigned','deleted','rejected','pending','pending_approval','application','requested','expired'))
    ) d;
  RETURN jsonb_build_object('userId',v_user_id,'isPlatformAdmin',v_admin,'memberships',v_memberships,'linkedMemberIds',v_linked,'linkedMemberships', (SELECT COALESCE(jsonb_agg(jsonb_build_object('clubId',x.club_id,'memberId',x.id) ORDER BY x.club_id,x.id),'[]'::jsonb) FROM public.club_members x WHERE x.id IN (SELECT (jsonb_array_elements_text(v_linked))::uuid)),'inactiveMemberships',v_inactive);
END; $function$;

CREATE OR REPLACE FUNCTION public.mobile_resolve_google_club_access(p_sync_secret text, p_google_subject text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_is_platform_admin boolean := false;
  v_memberships jsonb := '[]'::jsonb;
  v_linked_member_ids jsonb := '[]'::jsonb;
  v_inactive jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(trim(p_google_subject), '') IS NULL OR NULLIF(lower(trim(p_email)), '') IS NULL THEN
    RAISE EXCEPTION 'Verified Google identity required' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_user_id
  FROM auth.users u
  JOIN auth.identities i ON i.user_id = u.id
  WHERE lower(u.email) = lower(trim(p_email))
    AND u.email_confirmed_at IS NOT NULL
    AND i.provider = 'google'
    AND i.provider_id = trim(p_google_subject)
  ORDER BY u.created_at ASC, u.id ASC
  LIMIT 1;

  -- Diagnostic only: rows tied to the caller's exact auth user id (when one
  -- matched) or the exact verified email that fail the active filters. When no
  -- account matched, the same role exclusion as linkedMemberIds applies.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'clubId', d.club_id,
      'clubName', d.club_name,
      'memberId', d.id,
      'status', d.reason
    ) ORDER BY d.club_name, d.club_id, d.id), '[]'::jsonb)
  INTO v_inactive
  FROM (
    SELECT cm.id, cm.club_id, c.name AS club_name,
      CASE
        WHEN lower(COALESCE(cm.status::text, 'active')) IN (
          'inactive', 'suspended', 'blocked', 'disabled',
          'cancelled', 'canceled', 'resigned', 'deleted', 'rejected',
          'pending', 'pending_approval', 'application', 'requested', 'expired'
        ) THEN lower(cm.status::text)
        WHEN COALESCE(cm.is_pending_approval, false) THEN 'pending'
        WHEN COALESCE(cm.suspension_status::text, '') IN ('suspended', 'manual_hold', 'blocked', 'revoked') THEN cm.suspension_status::text
        WHEN cm.access_suspended_at IS NOT NULL THEN 'suspended'
        ELSE 'inactive'
      END AS reason
    FROM public.club_members cm
    LEFT JOIN public.clubs c ON c.id = cm.club_id
    WHERE (
        (v_user_id IS NOT NULL AND cm.user_id = v_user_id)
        OR lower(COALESCE(cm.email, '')) = lower(trim(p_email))
      )
      AND (
        v_user_id IS NOT NULL
        OR lower(COALESCE(cm.role::text, 'member')) NOT IN ('admin', 'super_admin', 'owner')
      )
      AND NOT (
        COALESCE(cm.is_pending_approval, false) = false
        AND cm.access_suspended_at IS NULL
        AND COALESCE(cm.suspension_status::text, '') NOT IN ('suspended', 'manual_hold', 'blocked', 'revoked')
        AND lower(COALESCE(cm.status::text, 'active')) NOT IN (
          'inactive', 'suspended', 'blocked', 'disabled',
          'cancelled', 'canceled', 'resigned', 'deleted', 'rejected',
          'pending', 'pending_approval', 'application', 'requested', 'expired'
        )
      )
  ) d;

  IF v_user_id IS NULL THEN
    SELECT COALESCE(jsonb_agg(cm.id ORDER BY cm.club_id, cm.id), '[]'::jsonb)
    INTO v_linked_member_ids
    FROM public.club_members cm
    WHERE lower(COALESCE(cm.email, '')) = lower(trim(p_email))
      AND COALESCE(cm.is_pending_approval, false) = false
      AND cm.access_suspended_at IS NULL
      AND COALESCE(cm.suspension_status::text, '') NOT IN ('suspended', 'manual_hold', 'blocked', 'revoked')
      AND lower(COALESCE(cm.status::text, 'active')) NOT IN (
        'inactive', 'suspended', 'blocked', 'disabled',
        'cancelled', 'canceled', 'resigned', 'deleted', 'rejected',
        'pending', 'pending_approval', 'application', 'requested', 'expired'
      )
      AND lower(COALESCE(cm.role::text, 'member')) NOT IN ('admin', 'super_admin', 'owner');

    RETURN jsonb_build_object(
      'userId', NULL,
      'isPlatformAdmin', false,
      'memberships', '[]'::jsonb,
      'linkedMemberIds', v_linked_member_ids,
      'linkedMemberships', (SELECT COALESCE(jsonb_agg(jsonb_build_object('clubId',x.club_id,'memberId',x.id) ORDER BY x.club_id,x.id),'[]'::jsonb) FROM public.club_members x WHERE x.id IN (SELECT (jsonb_array_elements_text(v_linked_member_ids))::uuid)),
      'inactiveMemberships', v_inactive
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_user_id AND ur.role IN ('admin', 'moderator')
  ) INTO v_is_platform_admin;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'clubId', own.club_id,
      'memberId', own.id,
      'role', own.role
    ) ORDER BY own.club_id
  ), '[]'::jsonb)
  INTO v_memberships
  FROM (
    SELECT DISTINCT ON (cm.club_id)
      cm.id,
      cm.club_id,
      cm.role
    FROM public.club_members cm
    WHERE cm.user_id = v_user_id
      AND COALESCE(cm.is_pending_approval, false) = false
      AND cm.access_suspended_at IS NULL
      AND COALESCE(cm.suspension_status::text, '') NOT IN ('suspended', 'manual_hold', 'blocked', 'revoked')
      AND lower(COALESCE(cm.status::text, 'active')) NOT IN (
        'inactive', 'suspended', 'blocked', 'disabled',
        'cancelled', 'canceled', 'resigned', 'deleted', 'rejected',
        'pending', 'pending_approval', 'application', 'requested', 'expired'
      )
    ORDER BY cm.club_id, cm.joined_at ASC NULLS LAST, cm.id ASC
  ) own;

  -- Additional family profiles are available only within a club the account
  -- itself belongs to, and only while the exact same-email row is active.
  SELECT COALESCE(jsonb_agg(linked.id ORDER BY linked.club_id, linked.id), '[]'::jsonb)
  INTO v_linked_member_ids
  FROM public.club_members linked
  WHERE lower(COALESCE(linked.email, '')) = lower(trim(p_email))
    AND COALESCE(linked.is_pending_approval, false) = false
    AND linked.access_suspended_at IS NULL
    AND COALESCE(linked.suspension_status::text, '') NOT IN ('suspended', 'manual_hold', 'blocked', 'revoked')
    AND lower(COALESCE(linked.status::text, 'active')) NOT IN (
      'inactive', 'suspended', 'blocked', 'disabled',
      'cancelled', 'canceled', 'resigned', 'deleted', 'rejected',
      'pending', 'pending_approval', 'application', 'requested', 'expired'
    )
    AND EXISTS (
      SELECT 1 FROM public.club_members own
      WHERE own.user_id = v_user_id
        AND own.club_id = linked.club_id
        AND COALESCE(own.is_pending_approval, false) = false
        AND own.access_suspended_at IS NULL
        AND COALESCE(own.suspension_status::text, '') NOT IN ('suspended', 'manual_hold', 'blocked', 'revoked')
        AND lower(COALESCE(own.status::text, 'active')) NOT IN (
          'inactive', 'suspended', 'blocked', 'disabled',
          'cancelled', 'canceled', 'resigned', 'deleted', 'rejected',
          'pending', 'pending_approval', 'application', 'requested', 'expired'
        )
    );

  RETURN jsonb_build_object(
    'userId', v_user_id,
    'isPlatformAdmin', v_is_platform_admin,
    'memberships', v_memberships,
    'linkedMemberIds', v_linked_member_ids,
      'linkedMemberships', (SELECT COALESCE(jsonb_agg(jsonb_build_object('clubId',x.club_id,'memberId',x.id) ORDER BY x.club_id,x.id),'[]'::jsonb) FROM public.club_members x WHERE x.id IN (SELECT (jsonb_array_elements_text(v_linked_member_ids))::uuid)),
    'inactiveMemberships', v_inactive
  );
END;
$function$;
