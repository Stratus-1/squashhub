-- Security hardening: prevent direct authenticated member writes from forging
-- settlement, payment confirmation, or admin-invitation fields. SECURITY DEFINER
-- payment routines and service-role calls run outside the authenticated role and
-- remain trusted.

CREATE OR REPLACE FUNCTION public.bar_tab_entries_guard_self_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT public.is_club_admin(auth.uid(), NEW.club_id)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.settled := false;
    NEW.settled_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.settled IS DISTINCT FROM OLD.settled
     OR NEW.settled_at IS DISTINCT FROM OLD.settled_at THEN
    RAISE EXCEPTION 'Only club admins can settle bar tab entries';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bar_tab_entries_guard_self_settlement() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bar_tab_entries_guard_self_settlement ON public.bar_tab_entries;
CREATE TRIGGER trg_bar_tab_entries_guard_self_settlement
BEFORE INSERT OR UPDATE OF settled, settled_at ON public.bar_tab_entries
FOR EACH ROW EXECUTE FUNCTION public.bar_tab_entries_guard_self_settlement();

-- Keep top-up requests member-editable only while pending. The amount remains
-- the requested amount on INSERT (members must be able to choose a top-up), but
-- no member-created row can carry approval state or confirmation metadata.
CREATE OR REPLACE FUNCTION public.member_credit_transactions_guard_self_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT public.is_club_admin(auth.uid(), NEW.club_id)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
      RAISE EXCEPTION 'Top-up amount must be greater than zero';
    END IF;
    NEW.status := 'pending';
    NEW.confirmed_at := NULL;
    NEW.confirmed_by := NULL;
    NEW.type := 'topup';
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'This transaction can no longer be edited';
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
     OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
     OR NEW.club_id IS DISTINCT FROM OLD.club_id
     OR NEW.club_member_id IS DISTINCT FROM OLD.club_member_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Only an administrator can change payment or approval details';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.member_credit_transactions_guard_self_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_member_credit_transactions_guard ON public.member_credit_transactions;
CREATE TRIGGER trg_member_credit_transactions_guard
BEFORE INSERT OR UPDATE ON public.member_credit_transactions
FOR EACH ROW EXECUTE FUNCTION public.member_credit_transactions_guard_self_fields();

-- Keep member registration changes limited to attendance/partner workflow.
-- Payment, confirmation, invitation provenance and proof fields are admin or
-- trusted backend concerns.
CREATE OR REPLACE FUNCTION public.club_champs_registrations_guard_self_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = NEW.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), t.club_id, 'champs')
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  NEW.status := 'pending_payment';
  NEW.fee_paid_cents := 0;
  NEW.payment_ref := NULL;
  NEW.paid_at := NULL;
  NEW.fee_payment_id := NULL;
  NEW.invited_by_admin := false;
  NEW.confirmed_at := NULL;
  NEW.confirmed_by := NULL;
  NEW.confirmation_source := NULL;
  NEW.proof_url := NULL;
  NEW.proof_uploaded_at := NULL;
  NEW.proof_uploaded_by := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS club_champs_registrations_guard_self_insert ON public.club_champs_registrations;
CREATE TRIGGER club_champs_registrations_guard_self_insert
BEFORE INSERT ON public.club_champs_registrations
FOR EACH ROW EXECUTE FUNCTION public.club_champs_registrations_guard_self_insert();

CREATE OR REPLACE FUNCTION public.club_champs_registrations_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = NEW.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), t.club_id, 'champs')
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.champ_id IS DISTINCT FROM OLD.champ_id
     OR NEW.club_member_id IS DISTINCT FROM OLD.club_member_id
     OR NEW.fee_paid_cents IS DISTINCT FROM OLD.fee_paid_cents
     OR NEW.payment_ref IS DISTINCT FROM OLD.payment_ref
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.fee_payment_id IS DISTINCT FROM OLD.fee_payment_id
     OR NEW.invited_by_admin IS DISTINCT FROM OLD.invited_by_admin
     OR NEW.invited_at IS DISTINCT FROM OLD.invited_at
     OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
     OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
     OR NEW.confirmation_source IS DISTINCT FROM OLD.confirmation_source
     OR NEW.invite_token IS DISTINCT FROM OLD.invite_token
     OR NEW.invite_token_created_at IS DISTINCT FROM OLD.invite_token_created_at
     OR NEW.invite_revoked_at IS DISTINCT FROM OLD.invite_revoked_at
     OR NEW.proof_url IS DISTINCT FROM OLD.proof_url
     OR NEW.proof_uploaded_at IS DISTINCT FROM OLD.proof_uploaded_at
     OR NEW.proof_uploaded_by IS DISTINCT FROM OLD.proof_uploaded_by
  THEN
    RAISE EXCEPTION 'Only tournament admins can change entry payment or confirmation details';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND lower(coalesce(NEW.status, '')) NOT IN ('pending_payment', 'pending_eft', 'cancelled', 'declined', 'invited')
  THEN
    RAISE EXCEPTION 'Only tournament admins can set entry status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.club_champs_registrations_guard_self_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_champs_registrations_guard_self_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS club_champs_registrations_guard_self_update ON public.club_champs_registrations;
CREATE TRIGGER club_champs_registrations_guard_self_update
BEFORE UPDATE ON public.club_champs_registrations
FOR EACH ROW EXECUTE FUNCTION public.club_champs_registrations_guard_self_update();