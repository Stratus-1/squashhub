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
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;
  is_admin := public.is_club_admin(actor, COALESCE(NEW.club_id, OLD.club_id))
              OR public.has_role(actor, 'admin'::app_role);
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

  SELECT c.auto_number_existing_onboarding INTO v_auto_number FROM public.clubs c WHERE c.id = OLD.club_id;
  NEW.club_id := OLD.club_id;
  -- A personal activation claim (claim_member_activation sets app.activation_claim)
  -- may link user_id onto a still-unclaimed member; every other path keeps the old value.
  NEW.user_id := CASE
    WHEN v_activation_claim AND OLD.user_id IS NULL AND NEW.user_id = actor THEN NEW.user_id
    ELSE OLD.user_id END;
  NEW.role := OLD.role;
  NEW.status := OLD.status;
  NEW.club_member_number := CASE
    WHEN OLD.club_member_number IS NULL AND COALESCE(v_auto_number, false) AND NEW.user_id = actor
    THEN public.allocate_next_member_number(OLD.club_id) ELSE OLD.club_member_number END;
  NEW.fee_category_id := OLD.fee_category_id;
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

CREATE OR REPLACE FUNCTION public.claim_member_activation(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE i record; m record; v_uid uuid := auth.uid(); v_email text; v_confirmed timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('status', 'not_signed_in'); END IF;
  SELECT * INTO i FROM public.member_activation_invites WHERE token_hash = encode(extensions.digest(coalesce(_token, ''), 'sha256'), 'hex') FOR UPDATE;
  IF i.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT id, email, user_id INTO m FROM public.club_members WHERE id = i.club_member_id FOR UPDATE;
  IF m.user_id = v_uid THEN
    UPDATE public.member_activation_invites SET used_at = coalesce(used_at, now()), used_by = coalesce(used_by, v_uid) WHERE id = i.id;
    UPDATE public.member_activation_invites SET revoked_at = now() WHERE club_member_id = m.id AND used_at IS NULL AND revoked_at IS NULL;
    RETURN jsonb_build_object('status', 'claimed', 'club_member_id', m.id);
  END IF;
  IF m.user_id IS NOT NULL OR i.used_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'already_claimed'); END IF;
  IF i.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'revoked'); END IF;
  IF i.expires_at < now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  SELECT email, email_confirmed_at INTO v_email, v_confirmed FROM auth.users WHERE id = v_uid;
  IF v_confirmed IS NULL OR lower(trim(coalesce(v_email, ''))) <> lower(trim(coalesce(m.email, ''))) THEN
    RETURN jsonb_build_object('status', 'email_mismatch');
  END IF;
  PERFORM set_config('app.activation_claim', '1', true);
  UPDATE public.club_members SET user_id = v_uid, updated_at = now() WHERE id = m.id AND user_id IS NULL;
  UPDATE public.member_activation_invites SET used_at = now(), used_by = v_uid WHERE id = i.id;
  UPDATE public.member_activation_invites SET revoked_at = now() WHERE club_member_id = m.id AND used_at IS NULL AND revoked_at IS NULL;
  RETURN jsonb_build_object('status', 'claimed', 'club_member_id', m.id);
END $function$;