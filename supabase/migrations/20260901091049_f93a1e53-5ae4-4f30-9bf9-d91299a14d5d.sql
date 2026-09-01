CREATE OR REPLACE FUNCTION public.allocate_next_member_number(_club_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_club_id::text, 0));
  _next := public.get_next_member_number(_club_id);
  RETURN _next;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_next_member_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_next_member_number(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.club_members_guard_self_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  is_admin boolean;
  v_open boolean;
  v_mode text;
  v_auto_number boolean;
BEGIN
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  is_admin := public.is_club_admin(actor, COALESCE(NEW.club_id, OLD.club_id))
              OR public.has_role(actor, 'admin'::app_role);

  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM actor THEN
      RETURN NEW;
    END IF;

    SELECT c.public_applications_enabled, c.member_activation_mode,
           c.auto_number_existing_onboarding
      INTO v_open, v_mode, v_auto_number
    FROM public.clubs c
    WHERE c.id = NEW.club_id;

    IF v_open IS NULL THEN
      RAISE EXCEPTION 'Club not found';
    END IF;
    IF v_open = false THEN
      RAISE EXCEPTION 'This club is not accepting membership applications. Please contact the club directly.'
        USING ERRCODE = '42501';
    END IF;

    NEW.role := 'member'::club_member_role;
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
    NEW.club_member_number := CASE
      WHEN COALESCE(v_auto_number, false) THEN public.allocate_next_member_number(NEW.club_id)
      ELSE NULL
    END;
    NEW.status := 'active'::member_status;
    NEW.pending_captain_claim := COALESCE(NEW.pending_captain_claim, false);
    NEW.applied_at := now();
    NEW.is_pending_approval := (COALESCE(v_mode, 'auto_on_payment') <> 'immediate');
    NEW.approved_at := CASE WHEN NEW.is_pending_approval THEN NULL ELSE now() END;
    NEW.approved_by := NULL;
    RETURN NEW;
  END IF;

  SELECT c.auto_number_existing_onboarding
    INTO v_auto_number
  FROM public.clubs c
  WHERE c.id = OLD.club_id;

  NEW.club_id := OLD.club_id;
  NEW.user_id := OLD.user_id;
  NEW.role := OLD.role;
  NEW.status := OLD.status;
  NEW.club_member_number := CASE
    WHEN OLD.club_member_number IS NULL
      AND COALESCE(v_auto_number, false)
      AND NEW.user_id = actor
    THEN public.allocate_next_member_number(OLD.club_id)
    ELSE OLD.club_member_number
  END;
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
$$;

REVOKE ALL ON FUNCTION public.club_members_guard_self_fields() FROM PUBLIC, anon, authenticated;