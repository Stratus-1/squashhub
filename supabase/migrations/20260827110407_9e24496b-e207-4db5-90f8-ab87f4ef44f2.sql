-- 1. Club-level application settings
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS public_applications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS member_activation_mode text NOT NULL DEFAULT 'auto_on_payment';

ALTER TABLE public.clubs DROP CONSTRAINT IF EXISTS clubs_member_activation_mode_chk;
ALTER TABLE public.clubs ADD CONSTRAINT clubs_member_activation_mode_chk
  CHECK (member_activation_mode IN ('immediate', 'auto_on_payment', 'admin_approval'));

-- 2. Pending-approval flag on membership rows
ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS is_pending_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

CREATE INDEX IF NOT EXISTS idx_club_members_pending
  ON public.club_members (club_id) WHERE is_pending_approval;

-- 3. Pending applicants are NOT club members for access purposes
CREATE OR REPLACE FUNCTION public.is_club_member(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE user_id = _user_id
      AND club_id = _club_id
      AND is_pending_approval = false
  )
$function$;

-- 4. Applicants can still see their own membership row and the club itself
DROP POLICY IF EXISTS "Users can view their own membership row" ON public.club_members;
CREATE POLICY "Users can view their own membership row"
ON public.club_members FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Applicants can view the club they applied to" ON public.clubs;
CREATE POLICY "Applicants can view the club they applied to"
ON public.clubs FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_members cm
  WHERE cm.club_id = clubs.id AND cm.user_id = auth.uid()
));

-- 5. Guard trigger: gate self-signup + protect privileged columns
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

    SELECT c.public_applications_enabled, c.member_activation_mode
      INTO v_open, v_mode
    FROM public.clubs c WHERE c.id = NEW.club_id;

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
    NEW.club_member_number := NULL;
    NEW.status := 'active'::member_status;
    NEW.pending_captain_claim := COALESCE(NEW.pending_captain_claim, false);
    NEW.applied_at := now();
    NEW.is_pending_approval := (COALESCE(v_mode, 'auto_on_payment') <> 'immediate');
    NEW.approved_at := CASE WHEN NEW.is_pending_approval THEN NULL ELSE now() END;
    NEW.approved_by := NULL;
    RETURN NEW;
  END IF;

  -- Non-admin UPDATE: revert protected columns
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
  NEW.is_pending_approval := OLD.is_pending_approval;
  NEW.applied_at := OLD.applied_at;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.club_members_guard_self_fields() FROM public, anon, authenticated;

-- 6. Notify club admins when someone applies
CREATE OR REPLACE FUNCTION public.notify_club_admins_of_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_pending_approval THEN
    INSERT INTO public.notifications (user_id, club_id, type, title, message, link)
    SELECT cm.user_id, NEW.club_id, 'membership_application',
           'New membership application',
           COALESCE(NEW.name, 'A new applicant') || ' has applied to join the club.',
           '/club-admin?tab=members&filter=pending'
    FROM public.club_members cm
    WHERE cm.club_id = NEW.club_id
      AND cm.role = 'admin'
      AND cm.user_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_club_admins_of_application() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_club_admins_of_application ON public.club_members;
CREATE TRIGGER trg_notify_club_admins_of_application
AFTER INSERT ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.notify_club_admins_of_application();

-- 7. Auto-activate pending applicants once a fee is paid
CREATE OR REPLACE FUNCTION public.activate_member_on_fee_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.paid = true THEN
    UPDATE public.club_members cm
       SET is_pending_approval = false,
           approved_at = COALESCE(cm.approved_at, now())
      FROM public.clubs c
     WHERE cm.id = NEW.club_member_id
       AND c.id = cm.club_id
       AND cm.is_pending_approval = true
       AND c.member_activation_mode = 'auto_on_payment';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_member_on_fee_paid() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_activate_member_on_fee_paid ON public.club_member_fee_payments;
CREATE TRIGGER trg_activate_member_on_fee_paid
AFTER INSERT OR UPDATE OF paid ON public.club_member_fee_payments
FOR EACH ROW EXECUTE FUNCTION public.activate_member_on_fee_paid();

-- 8. Admin approve / reject RPCs
CREATE OR REPLACE FUNCTION public.review_membership_application(_member_id uuid, _approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club uuid;
  v_user uuid;
  v_name text;
BEGIN
  SELECT club_id, user_id, name INTO v_club, v_user, v_name
  FROM public.club_members WHERE id = _member_id;

  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  IF NOT public.is_club_admin(auth.uid(), v_club) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  IF _approve THEN
    UPDATE public.club_members
       SET is_pending_approval = false,
           approved_at = now(),
           approved_by = auth.uid()
     WHERE id = _member_id;

    IF v_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, club_id, type, title, message, link)
      VALUES (v_user, v_club, 'membership_approved', 'Membership approved',
              'Your club membership has been approved. Welcome aboard!', '/');
    END IF;
  ELSE
    IF v_user IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, club_id, type, title, message, link)
      VALUES (v_user, v_club, 'membership_declined', 'Membership application declined',
              'Your membership application was not approved. Please contact the club for details.', '/');
    END IF;
    DELETE FROM public.club_members WHERE id = _member_id AND is_pending_approval = true;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_membership_application(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_membership_application(uuid, boolean) TO authenticated;