
REVOKE SELECT ON public.club_members FROM authenticated;
GRANT SELECT (id,club_id,user_id,role,club_member_number,plays_league,ladder_position,joined_at,updated_at,fee_category_id,phone,name,email,gender,skill_level,avatar_url,home_club_id,enable_league_association_id,is_league_only_membership,pending_captain_claim,face_consent_at,face_provisioned_at,face_provider_person_id,home_club_name,status,ranking_points,access_suspended_at,suspension_status,suspension_reason,suspension_outstanding,suspended_at,suspension_cleared_at,suspension_manual,whatsapp_opt_out,billing_exempt,person_id,occupation,skills,skills_other,volunteer_willing,skills_updated_at,is_pending_approval,applied_at,approved_at,approved_by,gobook_client_id,gobook_client_name,gobook_linked_at,sms_opt_out) ON public.club_members TO authenticated;
GRANT ALL ON public.club_members TO service_role;

CREATE OR REPLACE FUNCTION public.club_member_private_fields(_club_id uuid)
RETURNS TABLE(member_id uuid, id_number text, address text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cm.id, cm.id_number, cm.address
  FROM public.club_members cm
  WHERE cm.club_id = _club_id
    AND (
      public.is_club_admin(auth.uid(), _club_id)
      OR cm.user_id = auth.uid()
    );
$$;
GRANT EXECUTE ON FUNCTION public.club_member_private_fields(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.club_member_id_number_taken(_club_id uuid, _id_number text, _exclude_member_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN NOT public.is_club_admin(auth.uid(), _club_id) THEN false
  ELSE EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = _club_id
      AND cm.id_number = _id_number
      AND (_exclude_member_id IS NULL OR cm.id <> _exclude_member_id)
  ) END;
$$;
GRANT EXECUTE ON FUNCTION public.club_member_id_number_taken(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.club_member_email_id_conflict(_club_id uuid, _email text, _id_number text, _exclude_member_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN NOT public.is_club_admin(auth.uid(), _club_id) THEN false
  ELSE EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = _club_id
      AND lower(cm.email) = lower(_email)
      AND cm.id_number = _id_number
      AND (_exclude_member_id IS NULL OR cm.id <> _exclude_member_id)
  ) END;
$$;
GRANT EXECUTE ON FUNCTION public.club_member_email_id_conflict(uuid, text, text, uuid) TO authenticated;
