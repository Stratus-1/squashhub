CREATE OR REPLACE FUNCTION public.club_champs_registrations_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Only guard direct API writes by end users. SECURITY DEFINER RPCs and
  -- service_role/webhook writes run as another role and are trusted.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = NEW.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), t.club_id, 'champs')
  ) INTO is_admin;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- Immutable identity / financial / admin-confirmation columns for self-service writes
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
  THEN
    RAISE EXCEPTION 'Only tournament admins can change entry payment or confirmation details';
  END IF;

  -- Self-service status transitions are limited to non-paid states
  IF NEW.status IS DISTINCT FROM OLD.status
     AND lower(coalesce(NEW.status, '')) NOT IN ('pending_payment', 'pending_eft', 'cancelled', 'declined')
  THEN
    RAISE EXCEPTION 'Only tournament admins can set entry status to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS club_champs_registrations_guard_self_update ON public.club_champs_registrations;
CREATE TRIGGER club_champs_registrations_guard_self_update
BEFORE UPDATE ON public.club_champs_registrations
FOR EACH ROW EXECUTE FUNCTION public.club_champs_registrations_guard_self_update();

-- Also guard self-service inserts from being created pre-paid
CREATE OR REPLACE FUNCTION public.club_champs_registrations_guard_self_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = NEW.champ_id
      AND public.is_club_admin_or_permitted(auth.uid(), t.club_id, 'champs')
  ) INTO is_admin;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  NEW.fee_paid_cents := 0;
  NEW.payment_ref := NULL;
  NEW.paid_at := NULL;
  NEW.fee_payment_id := NULL;
  NEW.invited_by_admin := false;
  NEW.confirmed_at := NULL;
  NEW.confirmed_by := NULL;
  NEW.confirmation_source := NULL;
  IF lower(coalesce(NEW.status, '')) NOT IN ('pending_payment', 'pending_eft', 'cancelled', 'declined', 'invited', '') THEN
    NEW.status := 'pending_payment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS club_champs_registrations_guard_self_insert ON public.club_champs_registrations;
CREATE TRIGGER club_champs_registrations_guard_self_insert
BEFORE INSERT ON public.club_champs_registrations
FOR EACH ROW EXECUTE FUNCTION public.club_champs_registrations_guard_self_insert();