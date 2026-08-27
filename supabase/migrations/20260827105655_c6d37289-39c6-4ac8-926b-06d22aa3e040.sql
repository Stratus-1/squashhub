CREATE OR REPLACE FUNCTION public.club_members_guard_self_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  is_admin boolean;
BEGIN
  -- Service role / background jobs (no auth context) are unrestricted
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  is_admin := public.is_club_admin(actor, COALESCE(NEW.club_id, OLD.club_id))
              OR public.has_role(actor, 'admin'::app_role);

  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Self-signup: force safe defaults, no privileged or financial state
    IF NEW.user_id IS DISTINCT FROM actor THEN
      RETURN NEW; -- other policies/triggers already restrict this case
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
    NEW.club_member_number := NULL;
    NEW.status := 'active'::member_status;
    NEW.pending_captain_claim := COALESCE(NEW.pending_captain_claim, false);
    RETURN NEW;
  END IF;

  -- UPDATE by a non-admin: revert every protected column
  NEW.club_id := OLD.club_id;
  NEW.user_id := OLD.user_id;
  NEW.role := OLD.role;
  NEW.status := OLD.status;
  NEW.club_member_number := OLD.club_member_number;
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_club_members_guard_self_fields ON public.club_members;
CREATE TRIGGER trg_club_members_guard_self_fields
BEFORE INSERT OR UPDATE ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.club_members_guard_self_fields();