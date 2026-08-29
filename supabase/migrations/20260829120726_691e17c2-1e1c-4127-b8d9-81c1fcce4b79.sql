
-- Guard: non-admin members may not set financial / paid-status fields on their own fee rows.
-- Trusted SECURITY DEFINER routines (payment verification, invoicing, billing) run as
-- 'postgres' and are therefore exempt; direct PostgREST writes run as 'authenticated'.

CREATE OR REPLACE FUNCTION public.fee_payments_guard_self_fields()
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

  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
           SELECT 1 FROM public.club_members cm
           WHERE cm.user_id = NEW.user_id
             AND public.is_club_admin(auth.uid(), cm.club_id)
         )
    INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.paid := false;
    NEW.paid_at := NULL;
    NEW.payment_method := NULL;
    NEW.transaction_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.paid IS DISTINCT FROM OLD.paid
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.club_id IS DISTINCT FROM OLD.club_id
     OR NEW.fee_type IS DISTINCT FROM OLD.fee_type THEN
    RAISE EXCEPTION 'Only club admins can change fee amounts or payment status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fee_payments_guard_self_fields ON public.fee_payments;
CREATE TRIGGER trg_fee_payments_guard_self_fields
BEFORE INSERT OR UPDATE ON public.fee_payments
FOR EACH ROW EXECUTE FUNCTION public.fee_payments_guard_self_fields();


CREATE OR REPLACE FUNCTION public.club_member_fee_payments_guard_self_fields()
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

  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
           SELECT 1 FROM public.club_members cm
           WHERE cm.id = NEW.club_member_id
             AND public.is_club_admin(auth.uid(), cm.club_id)
         )
    INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.paid := false;
    NEW.paid_at := NULL;
    NEW.invoice_number := NULL;
    NEW.invoice_issued_at := NULL;
    NEW.invoice_due_date := NULL;
    NEW.invoice_send_date := NULL;
    NEW.invoice_email_sent_at := NULL;
    NEW.invoice_email_status := NULL;
    NEW.is_pass_through := COALESCE(NEW.is_pass_through, false);
    NEW.linked_fee_payment_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.paid IS DISTINCT FROM OLD.paid
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.club_member_id IS DISTINCT FROM OLD.club_member_id
     OR NEW.fee_type IS DISTINCT FROM OLD.fee_type
     OR NEW.season_year IS DISTINCT FROM OLD.season_year
     OR NEW.is_pass_through IS DISTINCT FROM OLD.is_pass_through
     OR NEW.linked_fee_payment_id IS DISTINCT FROM OLD.linked_fee_payment_id
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_issued_at IS DISTINCT FROM OLD.invoice_issued_at
     OR NEW.invoice_due_date IS DISTINCT FROM OLD.invoice_due_date
     OR NEW.invoice_send_date IS DISTINCT FROM OLD.invoice_send_date
     OR NEW.invoice_email_sent_at IS DISTINCT FROM OLD.invoice_email_sent_at
     OR NEW.invoice_email_status IS DISTINCT FROM OLD.invoice_email_status THEN
    RAISE EXCEPTION 'Only club admins can change fee amounts, invoices or payment status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_club_member_fee_payments_guard_self_fields ON public.club_member_fee_payments;
CREATE TRIGGER trg_club_member_fee_payments_guard_self_fields
BEFORE INSERT OR UPDATE ON public.club_member_fee_payments
FOR EACH ROW EXECUTE FUNCTION public.club_member_fee_payments_guard_self_fields();
