CREATE TABLE public.club_recurring_settings (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  recurring_enabled boolean NOT NULL DEFAULT true,
  allowed_months int[] NOT NULL DEFAULT ARRAY[3,4,6,10,12],
  arrears_enabled boolean NOT NULL DEFAULT false,
  arrears_from date,
  arrears_until date,
  arrears_max_months int NOT NULL DEFAULT 6,
  arrears_min_amount numeric NOT NULL DEFAULT 0,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.club_recurring_settings TO authenticated;
GRANT ALL ON public.club_recurring_settings TO service_role;
ALTER TABLE public.club_recurring_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read recurring settings" ON public.club_recurring_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Club finance admins insert recurring settings" ON public.club_recurring_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'));
CREATE POLICY "Club finance admins update recurring settings" ON public.club_recurring_settings FOR UPDATE TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'))
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'));

CREATE OR REPLACE FUNCTION public.club_recurring_settings_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.allowed_months := ARRAY(SELECT DISTINCT m FROM unnest(NEW.allowed_months) m WHERE m BETWEEN 1 AND 24 ORDER BY m);
  IF NEW.arrears_max_months < 1 OR NEW.arrears_max_months > 24 THEN RAISE EXCEPTION 'Maximum months must be 1-24'; END IF;
  IF NEW.arrears_min_amount < 0 THEN RAISE EXCEPTION 'Minimum amount cannot be negative'; END IF;
  IF NEW.arrears_from IS NOT NULL AND NEW.arrears_until IS NOT NULL AND NEW.arrears_until < NEW.arrears_from THEN
    RAISE EXCEPTION 'End date must be after start date';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_club_recurring_settings_validate BEFORE INSERT OR UPDATE ON public.club_recurring_settings
  FOR EACH ROW EXECUTE FUNCTION public.club_recurring_settings_validate();

CREATE TABLE public.recurring_payment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.recurring_payment_audit TO authenticated;
GRANT ALL ON public.recurring_payment_audit TO service_role;
ALTER TABLE public.recurring_payment_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club finance admins read recurring audit" ON public.recurring_payment_audit FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'));

CREATE OR REPLACE FUNCTION public.club_recurring_settings_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.recurring_payment_audit(club_id, actor_id, action, details)
  VALUES (NEW.club_id, auth.uid(), 'settings_changed',
    jsonb_build_object('old', CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) - 'updated_at' - 'updated_by' END,
                       'new', to_jsonb(NEW) - 'updated_at' - 'updated_by'));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_club_recurring_settings_audit AFTER INSERT OR UPDATE ON public.club_recurring_settings
  FOR EACH ROW EXECUTE FUNCTION public.club_recurring_settings_audit();

CREATE TABLE public.mandate_arrears_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  mandate_id uuid NOT NULL REFERENCES public.stitch_mandates(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  total_amount numeric NOT NULL CHECK (total_amount > 0),
  monthly_extra numeric NOT NULL CHECK (monthly_extra > 0),
  months_total int NOT NULL CHECK (months_total > 0),
  months_charged int NOT NULL DEFAULT 0,
  amount_collected numeric NOT NULL DEFAULT 0,
  starts_on date NOT NULL DEFAULT current_date,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mandate_arrears_one_active ON public.mandate_arrears_plans(mandate_id) WHERE status = 'active';
GRANT SELECT ON public.mandate_arrears_plans TO authenticated;
GRANT ALL ON public.mandate_arrears_plans TO service_role;
ALTER TABLE public.mandate_arrears_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own arrears plans" ON public.mandate_arrears_plans FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = club_member_id AND cm.user_id = auth.uid())
         OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'));
CREATE TRIGGER trg_mandate_arrears_plans_updated BEFORE UPDATE ON public.mandate_arrears_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Member starts an outstanding-balance plan on an existing active monthly payment.
CREATE OR REPLACE FUNCTION public.start_arrears_plan(p_mandate_id uuid, p_months int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record; s record; v_out numeric; v_extra numeric; v_base numeric; v_total numeric; v_plan uuid;
BEGIN
  SELECT sm.* INTO m FROM stitch_mandates sm JOIN club_members cm ON cm.id = sm.club_member_id
   WHERE sm.id = p_mandate_id AND cm.user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Recurring payment not found'; END IF;
  IF m.status <> 'active' THEN RAISE EXCEPTION 'Your monthly payment must be active first'; END IF;

  SELECT * INTO s FROM club_recurring_settings WHERE club_id = m.club_id;
  IF NOT FOUND OR NOT s.recurring_enabled OR NOT s.arrears_enabled THEN
    RAISE EXCEPTION 'Your club is not offering monthly payment of outstanding balances';
  END IF;
  IF (s.arrears_from IS NOT NULL AND current_date < s.arrears_from) OR (s.arrears_until IS NOT NULL AND current_date > s.arrears_until) THEN
    RAISE EXCEPTION 'This offer is not open right now';
  END IF;
  IF NOT (p_months = ANY(s.allowed_months)) OR p_months > s.arrears_max_months THEN
    RAISE EXCEPTION 'That period is not allowed by your club';
  END IF;
  IF EXISTS (SELECT 1 FROM mandate_arrears_plans WHERE mandate_id = m.id AND status = 'active') THEN
    RAISE EXCEPTION 'You already have an outstanding-balance plan on this payment';
  END IF;

  SELECT COALESCE(sum(amount),0) INTO v_out FROM club_member_fee_payments
   WHERE club_member_id = m.club_member_id AND paid = false AND amount > 0;
  IF v_out <= 0 THEN RAISE EXCEPTION 'You have no outstanding balance'; END IF;
  IF v_out < s.arrears_min_amount THEN RAISE EXCEPTION 'Your balance is below the club minimum for this offer'; END IF;

  v_extra := ceil(v_out / p_months * 100) / 100;
  v_base := m.max_amount_cents / 100.0;
  v_total := v_base + v_extra;

  -- Debit orders are capped by the bank-approved maximum: a higher total needs re-approval.
  IF COALESCE(m.gateway,'stitch') <> 'payfast' THEN
    RETURN jsonb_build_object('status','needs_reauth','monthly_extra',v_extra,'new_total',v_total,'outstanding',v_out);
  END IF;

  INSERT INTO mandate_arrears_plans(club_id, mandate_id, club_member_id, total_amount, monthly_extra, months_total, ends_on, created_by)
  VALUES (m.club_id, m.id, m.club_member_id, v_out, v_extra, p_months, (current_date + make_interval(months => p_months))::date, auth.uid())
  RETURNING id INTO v_plan;

  INSERT INTO recurring_payment_audit(club_id, actor_id, action, details)
  VALUES (m.club_id, auth.uid(), 'arrears_plan_started',
    jsonb_build_object('plan_id', v_plan, 'mandate_id', m.id, 'club_member_id', m.club_member_id, 'total', v_out, 'months', p_months, 'monthly_extra', v_extra));

  RETURN jsonb_build_object('status','active','plan_id',v_plan,'monthly_extra',v_extra,'new_total',v_total,'outstanding',v_out);
END $$;
REVOKE ALL ON FUNCTION public.start_arrears_plan(uuid,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_arrears_plan(uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_arrears_plan(p_plan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  SELECT ap.* INTO p FROM mandate_arrears_plans ap JOIN club_members cm ON cm.id = ap.club_member_id
   WHERE ap.id = p_plan_id AND ap.status = 'active'
     AND (cm.user_id = auth.uid() OR is_club_admin_or_permitted(auth.uid(), ap.club_id, 'finance'));
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;
  UPDATE mandate_arrears_plans SET status = 'cancelled' WHERE id = p.id;
  INSERT INTO recurring_payment_audit(club_id, actor_id, action, details)
  VALUES (p.club_id, auth.uid(), 'arrears_plan_cancelled', jsonb_build_object('plan_id', p.id));
END $$;
REVOKE ALL ON FUNCTION public.cancel_arrears_plan(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_arrears_plan(uuid) TO authenticated;