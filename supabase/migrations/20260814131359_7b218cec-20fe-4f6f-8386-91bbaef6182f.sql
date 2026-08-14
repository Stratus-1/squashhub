
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS baseline_member_count integer,
  ADD COLUMN IF NOT EXISTS baseline_amount numeric,
  ADD COLUMN IF NOT EXISTS baseline_currency text,
  ADD COLUMN IF NOT EXISTS baseline_cycle text,
  ADD COLUMN IF NOT EXISTS baseline_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS variance_threshold_pct numeric;

CREATE TABLE IF NOT EXISTS public.club_subscription_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  member_count integer NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  effective_from date NOT NULL DEFAULT current_date,
  note text,
  region text,
  federation_id uuid,
  set_by uuid,
  set_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.club_subscription_baselines TO authenticated;
GRANT ALL ON public.club_subscription_baselines TO service_role;
ALTER TABLE public.club_subscription_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins read own baselines"
ON public.club_subscription_baselines FOR SELECT TO authenticated
USING (
  public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance')
  OR public.is_platform_admin(auth.uid())
);

CREATE TABLE IF NOT EXISTS public.subscription_variance_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  baseline_member_count integer NOT NULL,
  current_member_count integer NOT NULL,
  variance_pct numeric NOT NULL,
  threshold_pct numeric NOT NULL,
  status text NOT NULL DEFAULT 'open',
  adjustment_invoice_id uuid REFERENCES public.platform_subscription_invoices(id) ON DELETE SET NULL,
  adjustment_amount numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT SELECT ON public.subscription_variance_flags TO authenticated;
GRANT ALL ON public.subscription_variance_flags TO service_role;
ALTER TABLE public.subscription_variance_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins read own variance flags"
ON public.subscription_variance_flags FOR SELECT TO authenticated
USING (
  public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance')
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY "Platform admins manage variance flags"
ON public.subscription_variance_flags FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER update_subscription_variance_flags_updated_at
BEFORE UPDATE ON public.subscription_variance_flags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Club admin locks in the agreed baseline when choosing a plan.
CREATE OR REPLACE FUNCTION public.set_club_subscription_baseline(
  _club_id uuid,
  _member_count integer,
  _amount numeric,
  _currency text,
  _cycle text,
  _actor_name text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev_count integer;
  _prev_amount numeric;
  _prev_cycle text;
  _id uuid;
BEGIN
  IF NOT (
    public.is_club_admin_or_permitted(auth.uid(), _club_id, 'finance')
    OR public.is_platform_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorised to set the subscription baseline for this club';
  END IF;

  SELECT baseline_member_count, baseline_amount, baseline_cycle
    INTO _prev_count, _prev_amount, _prev_cycle
  FROM public.clubs WHERE id = _club_id;

  UPDATE public.clubs SET
    baseline_member_count = _member_count,
    baseline_amount = _amount,
    baseline_currency = COALESCE(_currency, 'ZAR'),
    baseline_cycle = _cycle,
    baseline_set_at = now(),
    sla_billing_option = CASE
      WHEN _cycle = 'annual' THEN 'annual_upfront'
      WHEN _cycle = 'biannual' THEN 'biannual_upfront'
      ELSE 'monthly' END
  WHERE id = _club_id;

  INSERT INTO public.club_subscription_baselines
    (club_id, member_count, amount, currency, billing_cycle, set_by, set_by_name)
  VALUES (_club_id, _member_count, _amount, COALESCE(_currency, 'ZAR'), _cycle, auth.uid(), _actor_name)
  RETURNING id INTO _id;

  INSERT INTO public.club_billing_audit (club_id, field, old_value, new_value, changed_by, changed_by_name)
  VALUES
    (_club_id, 'baseline_member_count', _prev_count::text, _member_count::text, auth.uid(), _actor_name),
    (_club_id, 'baseline_amount', _prev_amount::text, _amount::text, auth.uid(), _actor_name),
    (_club_id, 'baseline_cycle', _prev_cycle, _cycle, auth.uid(), _actor_name);

  -- A fresh baseline clears any open variance flags.
  UPDATE public.subscription_variance_flags
     SET status = 'resolved', resolved_at = now()
   WHERE club_id = _club_id AND status = 'open';

  RETURN _id;
END;
$$;

-- Platform admin raises an adjustment invoice (positive) or credit (negative).
CREATE OR REPLACE FUNCTION public.create_subscription_adjustment_invoice(
  _club_id uuid,
  _amount numeric,
  _member_count integer,
  _note text DEFAULT NULL,
  _flag_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv uuid;
  _ccy text;
  _num text;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform administrators can raise adjustment invoices';
  END IF;

  SELECT COALESCE(baseline_currency, currency_code, 'ZAR') INTO _ccy FROM public.clubs WHERE id = _club_id;
  _num := 'ADJ-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(_club_id::text, 1, 4);

  INSERT INTO public.platform_subscription_invoices
    (invoice_number, club_id, plan_name, billing_cycle, period_start, period_end,
     member_count, price_per_member, subtotal, vat_amount, total, currency, status, issued_at, due_date)
  VALUES
    (_num, _club_id, CASE WHEN _amount < 0 THEN 'Subscription credit' ELSE 'Subscription adjustment' END,
     'adjustment', current_date, current_date,
     COALESCE(_member_count, 0), 0, _amount, 0, _amount, COALESCE(_ccy, 'ZAR'),
     CASE WHEN _amount < 0 THEN 'paid' ELSE 'issued' END, now(), current_date + 14)
  RETURNING id INTO _inv;

  IF _flag_id IS NOT NULL THEN
    UPDATE public.subscription_variance_flags
       SET status = 'resolved', resolved_at = now(), adjustment_invoice_id = _inv,
           adjustment_amount = _amount, note = COALESCE(_note, note)
     WHERE id = _flag_id;
  END IF;

  RETURN _inv;
END;
$$;
