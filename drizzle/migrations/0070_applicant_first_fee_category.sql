CREATE OR REPLACE FUNCTION public.club_members_guard_self_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := auth.uid();
  is_admin boolean;
  v_open boolean;
  v_mode text;
  v_auto_number boolean;
  v_has_admin boolean;
  v_activation_claim boolean := coalesce(current_setting('app.activation_claim', true), '') = '1';
  v_self_application boolean := false;
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;
  is_admin := public.is_club_admin(actor, COALESCE(NEW.club_id, OLD.club_id))
              OR public.has_role(actor, 'admin'::app_role)
              OR (TG_OP = 'UPDATE' AND public.is_club_member_manager(actor, OLD.club_id, OLD.user_id) AND OLD.role <> 'admin'::club_member_role);
  IF is_admin THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM actor THEN RETURN NEW; END IF;
    SELECT c.public_applications_enabled, c.member_activation_mode, c.auto_number_existing_onboarding
      INTO v_open, v_mode, v_auto_number FROM public.clubs c WHERE c.id = NEW.club_id;
    IF v_open IS NULL THEN RAISE EXCEPTION 'Club not found'; END IF;
    IF v_open = false THEN
      RAISE EXCEPTION 'This club is not accepting membership applications. Please contact the club directly.' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.club_members a
                   WHERE a.club_id = NEW.club_id AND a.role = 'admin' AND a.user_id IS NOT NULL)
      INTO v_has_admin;

    NEW.role := CASE WHEN v_has_admin THEN 'member'::club_member_role ELSE 'admin'::club_member_role END;
    NEW.billing_exempt := false;
    NEW.suspension_status := 'active'::member_suspension_status;
    NEW.suspension_outstanding := 0;
    NEW.suspension_manual := false;
    NEW.suspended_at := NULL;
    NEW.suspension_cleared_at := NULL;
    NEW.suspension_reason := NULL;
    NEW.access_suspended_at := NULL;
    NEW.ranking_points := 0;
    NEW.ladder_position := NULL;
    NEW.club_member_number := CASE WHEN COALESCE(v_auto_number, false) THEN public.allocate_next_member_number(NEW.club_id) ELSE NULL END;
    NEW.status := 'active'::member_status;
    NEW.pending_captain_claim := COALESCE(NEW.pending_captain_claim, false);
    NEW.applied_at := now();
    NEW.is_pending_approval := v_has_admin AND (COALESCE(v_mode, 'auto_on_payment') <> 'immediate');
    NEW.approved_at := CASE WHEN NEW.is_pending_approval THEN NULL ELSE now() END;
    NEW.approved_by := NULL;
    RETURN NEW;
  END IF;

  -- A person's own unfinished signup application may choose its FIRST fee
  -- category (the signup steps). Assigned categories stay locked, and imported
  -- / admin-created members can never pick one themselves.
  IF OLD.user_id = actor AND OLD.fee_category_id IS NULL AND NEW.fee_category_id IS NOT NULL THEN
    SELECT (OLD.is_pending_approval OR OLD.applied_at IS NOT NULL
            OR abs(extract(epoch FROM (OLD.joined_at - u.created_at))) < 600)
      INTO v_self_application
      FROM auth.users u WHERE u.id = actor;
    v_self_application := COALESCE(v_self_application, false)
      AND EXISTS (SELECT 1 FROM public.member_fee_categories f
                  WHERE f.id = NEW.fee_category_id AND f.club_id = OLD.club_id);
  END IF;

  SELECT c.auto_number_existing_onboarding INTO v_auto_number FROM public.clubs c WHERE c.id = OLD.club_id;
  NEW.club_id := OLD.club_id;
  NEW.user_id := CASE
    WHEN v_activation_claim AND OLD.user_id IS NULL AND NEW.user_id = actor THEN NEW.user_id
    ELSE OLD.user_id END;
  NEW.role := OLD.role;
  NEW.status := OLD.status;
  NEW.club_member_number := CASE
    WHEN OLD.club_member_number IS NULL AND COALESCE(v_auto_number, false) AND NEW.user_id = actor
    THEN public.allocate_next_member_number(OLD.club_id) ELSE OLD.club_member_number END;
  NEW.fee_category_id := CASE WHEN v_self_application THEN NEW.fee_category_id ELSE OLD.fee_category_id END;
  NEW.billing_exempt := OLD.billing_exempt;
  NEW.suspension_status := OLD.suspension_status;
  NEW.suspension_outstanding := OLD.suspension_outstanding;
  NEW.suspension_reason := OLD.suspension_reason;
  NEW.suspension_manual := OLD.suspension_manual;
  NEW.suspended_at := OLD.suspended_at;
  NEW.suspension_cleared_at := OLD.suspension_cleared_at;
  NEW.access_suspended_at := OLD.access_suspended_at;
  NEW.ranking_points := OLD.ranking_points;
  NEW.ladder_position := OLD.ladder_position;
  NEW.person_id := OLD.person_id;
  NEW.is_league_only_membership := OLD.is_league_only_membership;
  NEW.enable_league_association_id := OLD.enable_league_association_id;
  NEW.joined_at := OLD.joined_at;
  NEW.face_provisioned_at := OLD.face_provisioned_at;
  NEW.face_provider_person_id := OLD.face_provider_person_id;
  NEW.is_pending_approval := OLD.is_pending_approval;
  NEW.applied_at := OLD.applied_at;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;
  RETURN NEW;
END;
$function$;