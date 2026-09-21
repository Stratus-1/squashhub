
-- 1. Club setting -------------------------------------------------------
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS visitor_pass_requires_approval boolean NOT NULL DEFAULT false;
GRANT SELECT (visitor_pass_requires_approval) ON public.clubs TO anon;

-- 2. Fee categories carry the pass kind ---------------------------------
ALTER TABLE public.member_fee_categories
  ADD COLUMN IF NOT EXISTS visitor_pass_kind text;
DO $$ BEGIN
  ALTER TABLE public.member_fee_categories
    ADD CONSTRAINT member_fee_categories_visitor_pass_kind_chk
    CHECK (visitor_pass_kind IS NULL OR visitor_pass_kind IN ('day','three_day','month'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS member_fee_categories_visitor_pass_uniq
  ON public.member_fee_categories (club_id, visitor_pass_kind)
  WHERE visitor_pass_kind IS NOT NULL;

-- Seed the three pass rows for every existing club: amount 0, switched OFF.
-- active = false  -> not offered (not configured)
-- active = true, amount 0 -> a deliberate free pass
INSERT INTO public.member_fee_categories (club_id, name, annual_fee, active, visitor_pass_kind, description, pro_rate, billing_period, sort_order)
SELECT c.id, v.label, 0, false, v.kind, 'Visitor pass — sold at visitor registration', false, 'annual', 900 + v.ord
FROM public.clubs c
CROSS JOIN (VALUES ('day','Visitor Day Pass',1),('three_day','Visitor 3-Day Pass',2),('month','Visitor Monthly Pass',3)) AS v(kind,label,ord)
ON CONFLICT DO NOTHING;

-- New clubs get them automatically.
CREATE OR REPLACE FUNCTION public.seed_visitor_pass_fee_categories()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.member_fee_categories (club_id, name, annual_fee, active, visitor_pass_kind, description, pro_rate, billing_period, sort_order)
  SELECT NEW.id, v.label, 0, false, v.kind, 'Visitor pass — sold at visitor registration', false, 'annual', 900 + v.ord
  FROM (VALUES ('day','Visitor Day Pass',1),('three_day','Visitor 3-Day Pass',2),('month','Visitor Monthly Pass',3)) AS v(kind,label,ord)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_seed_visitor_pass_fees ON public.clubs;
CREATE TRIGGER trg_seed_visitor_pass_fees AFTER INSERT ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.seed_visitor_pass_fee_categories();

-- 3. The pass records ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.club_visitor_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  fee_category_id uuid REFERENCES public.member_fee_categories(id) ON DELETE SET NULL,
  fee_payment_id uuid REFERENCES public.club_member_fee_payments(id) ON DELETE SET NULL,
  pass_kind text NOT NULL CHECK (pass_kind IN ('day','three_day','month')),
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','pending_approval','active','expired','cancelled')),
  valid_from timestamptz,
  valid_until timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.club_visitor_passes TO authenticated;
GRANT ALL ON public.club_visitor_passes TO service_role;
ALTER TABLE public.club_visitor_passes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Visitors see their own passes" ON public.club_visitor_passes;
CREATE POLICY "Visitors see their own passes" ON public.club_visitor_passes
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = club_visitor_passes.club_member_id AND cm.user_id = auth.uid())
  OR public.is_club_admin(auth.uid(), club_id)
  OR public.is_platform_admin(auth.uid())
);

DROP POLICY IF EXISTS "Club admins manage visitor passes" ON public.club_visitor_passes;
CREATE POLICY "Club admins manage visitor passes" ON public.club_visitor_passes
FOR UPDATE TO authenticated
USING (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS club_visitor_passes_member_idx ON public.club_visitor_passes (club_member_id, status);
CREATE INDEX IF NOT EXISTS club_visitor_passes_club_idx ON public.club_visitor_passes (club_id, status);

DROP TRIGGER IF EXISTS trg_club_visitor_passes_updated ON public.club_visitor_passes;
CREATE TRIGGER trg_club_visitor_passes_updated BEFORE UPDATE ON public.club_visitor_passes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Visitor pass income routing in the ledger ---------------------------
CREATE OR REPLACE FUNCTION public.journal_fee_assessment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  v_club_id uuid;
  v_ref uuid;
  v_income_account public.gl_account;
  v_amount numeric;
  v_label text;
  v_ftype text;
BEGIN
  v_amount := COALESCE(NEW.amount, 0);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  IF NEW.invoice_issued_at IS NULL
     AND NEW.invoice_due_date IS NOT NULL
     AND NEW.invoice_due_date > CURRENT_DATE THEN
    RETURN NEW;
  END IF;

  SELECT cm.club_id INTO v_club_id FROM public.club_members cm WHERE cm.id = NEW.club_member_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  v_ftype := lower(COALESCE(NEW.fee_type, ''));
  v_label := 'Fee raised: ' || COALESCE(NEW.fee_label, 'membership');

  IF v_ftype LIKE '%visitor%' THEN
    v_income_account := 'visitor_income';
  ELSIF NEW.is_pass_through = true OR v_ftype LIKE '%league%' OR v_ftype LIKE '%affiliation%' THEN
    v_income_account := 'league_fees_income';
  ELSIF v_ftype LIKE '%national%' OR v_ftype LIKE '%ssa%' OR v_ftype LIKE '%body%' THEN
    v_income_account := 'national_body_income';
  ELSIF v_ftype LIKE '%bar%' OR v_ftype LIKE '%honesty%' THEN
    v_income_account := 'bar_income';
  ELSIF v_ftype LIKE '%tournament%' OR v_ftype LIKE '%champ%' OR v_ftype LIKE '%tourn%' THEN
    v_income_account := 'tournament_income';
  ELSE
    v_income_account := 'membership_income';
  END IF;

  v_ref := gen_random_uuid();

  INSERT INTO public.club_journal_entries
    (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
  VALUES
    (v_club_id, NEW.club_member_id, NEW.id, 'debtors', v_amount, 0, v_label, v_ref),
    (v_club_id, NEW.club_member_id, NEW.id, v_income_account, 0, v_amount, v_label, v_ref);

  RETURN NEW;
END;
$function$;

-- 5. Pass lifecycle ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.visitor_pass_duration(p_kind text)
RETURNS interval LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_kind WHEN 'day' THEN interval '24 hours'
                     WHEN 'three_day' THEN interval '72 hours'
                     WHEN 'month' THEN interval '1 month' END;
$$;

CREATE OR REPLACE FUNCTION public.visitor_pass_sync(p_pass_id uuid)
RETURNS public.club_visitor_passes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.club_visitor_passes;
  v_settled boolean;
  v_needs_approval boolean;
BEGIN
  SELECT * INTO p FROM public.club_visitor_passes WHERE id = p_pass_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Pass not found'; END IF;
  IF p.status = 'cancelled' THEN RETURN p; END IF;

  -- Already ran its course?
  IF p.valid_until IS NOT NULL AND p.valid_until <= now() THEN
    IF p.status <> 'expired' THEN
      UPDATE public.club_visitor_passes SET status = 'expired' WHERE id = p.id RETURNING * INTO p;
    END IF;
    RETURN p;
  END IF;

  v_settled := (COALESCE(p.amount,0) <= 0)
    OR EXISTS (SELECT 1 FROM public.club_member_fee_payments f WHERE f.id = p.fee_payment_id AND f.paid = true);

  IF NOT v_settled THEN
    IF p.status <> 'pending_payment' THEN
      UPDATE public.club_visitor_passes SET status = 'pending_payment' WHERE id = p.id RETURNING * INTO p;
    END IF;
    RETURN p;
  END IF;

  SELECT COALESCE(visitor_pass_requires_approval,false) INTO v_needs_approval FROM public.clubs WHERE id = p.club_id;

  IF v_needs_approval AND p.approved_at IS NULL THEN
    IF p.status <> 'pending_approval' THEN
      UPDATE public.club_visitor_passes SET status = 'pending_approval' WHERE id = p.id RETURNING * INTO p;
    END IF;
    RETURN p;
  END IF;

  UPDATE public.club_visitor_passes
     SET status = 'active',
         valid_from = COALESCE(p.valid_from, now()),
         valid_until = COALESCE(p.valid_until, COALESCE(p.valid_from, now()) + public.visitor_pass_duration(p.pass_kind))
   WHERE id = p.id
  RETURNING * INTO p;
  RETURN p;
END; $$;

REVOKE ALL ON FUNCTION public.visitor_pass_sync(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.visitor_pass_sync(uuid) TO authenticated, service_role;

-- Settling the fee activates the pass automatically (idempotent).
CREATE OR REPLACE FUNCTION public.visitor_pass_on_fee_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.paid = true AND COALESCE(OLD.paid,false) = false THEN
    FOR r IN SELECT id FROM public.club_visitor_passes WHERE fee_payment_id = NEW.id AND status <> 'cancelled' LOOP
      PERFORM public.visitor_pass_sync(r.id);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_visitor_pass_on_fee_paid ON public.club_member_fee_payments;
CREATE TRIGGER trg_visitor_pass_on_fee_paid AFTER UPDATE OF paid ON public.club_member_fee_payments
FOR EACH ROW EXECUTE FUNCTION public.visitor_pass_on_fee_paid();

-- Buy a pass (called by the visitor themselves, or by a club admin on their behalf).
CREATE OR REPLACE FUNCTION public.visitor_purchase_pass(p_club_member_id uuid, p_pass_kind text)
RETURNS public.club_visitor_passes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record;
  cat record;
  v_pass_id uuid;
  v_fee_id uuid;
  v_label text;
BEGIN
  SELECT cm.id, cm.club_id, cm.user_id, lower(cm.role) AS role INTO m
  FROM public.club_members cm WHERE cm.id = p_club_member_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Visitor not found'; END IF;
  IF m.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_club_admin(auth.uid(), m.club_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF m.role <> 'visitor' THEN RAISE EXCEPTION 'Visitor passes apply to visitors only'; END IF;

  SELECT id, name, annual_fee, active INTO cat
  FROM public.member_fee_categories
  WHERE club_id = m.club_id AND visitor_pass_kind = p_pass_kind;

  IF cat.id IS NULL OR cat.active IS NOT TRUE THEN
    RAISE EXCEPTION 'This club does not offer that visitor pass';
  END IF;

  -- One live pass at a time.
  IF EXISTS (SELECT 1 FROM public.club_visitor_passes
              WHERE club_member_id = m.id AND status IN ('pending_payment','pending_approval','active')) THEN
    RAISE EXCEPTION 'You already have a visitor pass in progress';
  END IF;

  INSERT INTO public.club_visitor_passes (club_id, club_member_id, fee_category_id, pass_kind, amount, status)
  VALUES (m.club_id, m.id, cat.id, p_pass_kind, COALESCE(cat.annual_fee,0), 'pending_payment')
  RETURNING id INTO v_pass_id;

  IF COALESCE(cat.annual_fee,0) > 0 THEN
    v_label := cat.name || ' – ' || to_char(now(), 'YYYY-MM-DD HH24:MI');
    INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
    VALUES (m.id, 'visitor_pass', v_label, cat.annual_fee, false, EXTRACT(year FROM now())::int)
    RETURNING id INTO v_fee_id;
    UPDATE public.club_visitor_passes SET fee_payment_id = v_fee_id WHERE id = v_pass_id;
  END IF;

  RETURN public.visitor_pass_sync(v_pass_id);
END; $$;

REVOKE ALL ON FUNCTION public.visitor_purchase_pass(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.visitor_purchase_pass(uuid, text) TO authenticated, service_role;

-- Admin approve / reject.
CREATE OR REPLACE FUNCTION public.admin_decide_visitor_pass(p_pass_id uuid, p_approve boolean, p_reason text DEFAULT NULL)
RETURNS public.club_visitor_passes LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.club_visitor_passes;
  v_ref uuid;
  v_amount numeric;
BEGIN
  SELECT * INTO p FROM public.club_visitor_passes WHERE id = p_pass_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Pass not found'; END IF;
  IF NOT (public.is_club_admin(auth.uid(), p.club_id) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  IF p_approve THEN
    UPDATE public.club_visitor_passes
       SET approved_by = auth.uid(), approved_at = now()
     WHERE id = p.id;
    RETURN public.visitor_pass_sync(p.id);
  END IF;

  -- Rejection: nothing financial is deleted. An unpaid charge is reversed in
  -- the ledger with a full audit trail; a paid charge is left for the club to
  -- refund manually (flagged in the reason).
  UPDATE public.club_visitor_passes
     SET status = 'cancelled', cancelled_at = now(), cancel_reason = COALESCE(p_reason, 'Rejected by club admin')
   WHERE id = p.id RETURNING * INTO p;

  IF p.fee_payment_id IS NOT NULL THEN
    SELECT amount INTO v_amount FROM public.club_member_fee_payments WHERE id = p.fee_payment_id AND paid = false;
    IF COALESCE(v_amount,0) > 0 THEN
      v_ref := gen_random_uuid();
      INSERT INTO public.club_journal_entries
        (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
      VALUES
        (p.club_id, p.club_member_id, p.fee_payment_id, 'visitor_income', v_amount, 0, 'Visitor pass rejected – charge reversed', v_ref),
        (p.club_id, p.club_member_id, p.fee_payment_id, 'debtors', 0, v_amount, 'Visitor pass rejected – charge reversed', v_ref);
      INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, after_json, note)
      VALUES (p.club_id, v_ref, 'reverse', auth.uid(),
              jsonb_build_object('pass_id', p.id, 'amount', v_amount),
              'Visitor pass rejected by club admin');
    END IF;
  END IF;

  RETURN p;
END; $$;

REVOKE ALL ON FUNCTION public.admin_decide_visitor_pass(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_visitor_pass(uuid, boolean, text) TO authenticated, service_role;

-- 6. Entitlement ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_active_visitor_pass(p_club_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_visitor_passes
    WHERE club_member_id = p_club_member_id
      AND status = 'active'
      AND valid_from IS NOT NULL AND valid_from <= now()
      AND valid_until IS NOT NULL AND valid_until > now()
  );
$$;
REVOKE ALL ON FUNCTION public.has_active_visitor_pass(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_active_visitor_pass(uuid) TO authenticated, service_role;

-- A visitor may only create their own booking while a pass is live.
-- Members, admins and system/service inserts are unaffected.
CREATE OR REPLACE FUNCTION public.booking_visitor_entitled(p_user_id uuid, p_club_id uuid, p_club_member_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_member_id uuid;
  v_role text;
BEGIN
  IF p_club_id IS NULL OR p_user_id IS NULL THEN RETURN true; END IF;
  IF public.is_club_admin(p_user_id, p_club_id) OR public.is_platform_admin(p_user_id) THEN RETURN true; END IF;

  v_member_id := p_club_member_id;
  IF v_member_id IS NULL THEN
    SELECT id INTO v_member_id FROM public.club_members
     WHERE club_id = p_club_id AND user_id = p_user_id
     ORDER BY joined_at NULLS LAST LIMIT 1;
  END IF;
  IF v_member_id IS NULL THEN RETURN true; END IF;

  SELECT lower(role) INTO v_role FROM public.club_members WHERE id = v_member_id;
  IF v_role IS DISTINCT FROM 'visitor' THEN RETURN true; END IF;

  RETURN public.has_active_visitor_pass(v_member_id);
END; $$;
REVOKE ALL ON FUNCTION public.booking_visitor_entitled(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.booking_visitor_entitled(uuid, uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Visitors need an active pass to book" ON public.bookings;
CREATE POLICY "Visitors need an active pass to book" ON public.bookings
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.booking_visitor_entitled(auth.uid(), club_id, club_member_id));
