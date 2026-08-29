CREATE OR REPLACE FUNCTION public.member_credit_transactions_guard_self_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  -- Trusted server-side routines (service_role, postgres, SECURITY DEFINER RPCs) bypass
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.is_club_admin(auth.uid(), NEW.club_id)
                OR public.has_role(auth.uid(), 'admin'::app_role);

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.confirmed_at := NULL;
    NEW.confirmed_by := NULL;
    NEW.type := 'topup';
    IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
      RAISE EXCEPTION 'Top-up amount must be greater than zero';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: members may only touch descriptive / proof fields on pending rows
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