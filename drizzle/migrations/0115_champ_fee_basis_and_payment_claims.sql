
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS entry_fee_basis text,
  ADD COLUMN IF NOT EXISTS entry_fee_mixed_rule text,
  ADD COLUMN IF NOT EXISTS entry_fee_basis_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS entry_fee_basis_set_by uuid;
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_entry_fee_basis_chk;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_entry_fee_basis_chk CHECK (entry_fee_basis IS NULL OR entry_fee_basis IN ('per_player','per_category'));
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_entry_fee_mixed_rule_chk;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_entry_fee_mixed_rule_chk CHECK (entry_fee_mixed_rule IS NULL OR entry_fee_mixed_rule IN ('highest','first'));
COMMENT ON COLUMN public.tournaments.entry_fee_basis IS 'per_player | per_category | NULL = needs confirmation (no charges allowed)';

ALTER TABLE public.club_member_fee_payments
  ADD COLUMN IF NOT EXISTS champ_registration_id uuid,
  ADD COLUMN IF NOT EXISTS champ_charge_key text;
CREATE UNIQUE INDEX IF NOT EXISTS club_member_fee_payments_champ_charge_key_uq
  ON public.club_member_fee_payments (champ_charge_key) WHERE champ_charge_key IS NOT NULL;

CREATE TABLE public.champ_payment_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  champ_id uuid NOT NULL,
  claimant_user_id uuid,
  recorded_by_admin boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','needs_proof','approved','rejected')),
  method text NOT NULL CHECK (method IN ('eft','card','cash','other')),
  paid_on date,
  reference text,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  proof_path text,
  review_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.champ_payment_claim_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.champ_payment_claims(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL,
  registration_id uuid,
  fee_payment_id uuid,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX ON public.champ_payment_claims (champ_id, status);
CREATE INDEX ON public.champ_payment_claim_allocations (claim_id);
CREATE INDEX ON public.champ_payment_claim_allocations (club_member_id);

GRANT SELECT ON public.champ_payment_claims TO authenticated;
GRANT SELECT ON public.champ_payment_claim_allocations TO authenticated;
GRANT ALL ON public.champ_payment_claims TO service_role;
GRANT ALL ON public.champ_payment_claim_allocations TO service_role;
ALTER TABLE public.champ_payment_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.champ_payment_claim_allocations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.champ_user_can_act_for_member(p_member uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_user IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.club_members WHERE id = p_member AND user_id = p_user)
    OR public.member_is_delegate_of(p_member, p_user));
$$;

-- Writes only through functions below (no direct insert/update policies).
CREATE POLICY "claims: admins read" ON public.champ_payment_claims FOR SELECT TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));
CREATE POLICY "claims: claimant or member reads" ON public.champ_payment_claims FOR SELECT TO authenticated
  USING (claimant_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.champ_payment_claim_allocations a
     WHERE a.claim_id = id AND public.champ_user_can_act_for_member(a.club_member_id, auth.uid())));
CREATE POLICY "allocs: admins read" ON public.champ_payment_claim_allocations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.champ_payment_claims c WHERE c.id = claim_id AND public.is_club_admin(auth.uid(), c.club_id)));
CREATE POLICY "allocs: member reads own" ON public.champ_payment_claim_allocations FOR SELECT TO authenticated
  USING (public.champ_user_can_act_for_member(club_member_id, auth.uid())
      OR EXISTS (SELECT 1 FROM public.champ_payment_claims c WHERE c.id = claim_id AND c.claimant_user_id = auth.uid()));

-- Amount owed per registration under the saved basis (NULL when basis unconfirmed or ambiguous).
CREATE OR REPLACE FUNCTION public.champ_registration_fee_lines(p_champ uuid)
RETURNS TABLE(registration_id uuid, club_member_id uuid, division integer, amount_cents integer, charge_key text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; flat int; fees jsonb; mixed boolean;
BEGIN
  SELECT tt.entry_fee_basis, tt.entry_fee_mixed_rule, tt.division_fees INTO t FROM public.tournaments tt WHERE tt.id = p_champ;
  SELECT coalesce(c.entry_fee_cents,0) INTO flat FROM public.club_champs c WHERE c.id = p_champ;
  fees := coalesce(t.division_fees, '{}'::jsonb);
  SELECT count(DISTINCT v) > 1 INTO mixed FROM jsonb_each_text(fees) e(k, v);
  IF t.entry_fee_basis IS NULL THEN RETURN; END IF;
  IF t.entry_fee_basis = 'per_category' THEN
    RETURN QUERY
      SELECT r.id, r.club_member_id, d::int,
             coalesce((fees->>d::text)::int, flat),
             'champ:'||p_champ||':'||r.club_member_id||':cat'||d
        FROM public.club_champs_registrations r, unnest(coalesce(r.division_choices, ARRAY[]::int[])) d
       WHERE r.champ_id = p_champ AND lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn');
  ELSE
    IF mixed AND t.entry_fee_mixed_rule IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT r.id, r.club_member_id, NULL::int,
             CASE WHEN NOT mixed OR fees = '{}'::jsonb THEN coalesce((SELECT max(v::int) FROM jsonb_each_text(fees) e(k,v)), flat)
                  WHEN t.entry_fee_mixed_rule = 'highest' THEN coalesce((SELECT max((fees->>d::text)::int) FROM unnest(r.division_choices) d), flat)
                  ELSE coalesce((fees->>(r.division_choices[1])::text)::int, flat) END,
             'champ:'||p_champ||':'||r.club_member_id||':person'
        FROM public.club_champs_registrations r
       WHERE r.champ_id = p_champ AND lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.champ_fee_charge_preview(p_champ uuid)
RETURNS TABLE(registration_id uuid, club_member_id uuid, member_name text, member_email text, shared_email boolean,
              division integer, amount_cents integer, charge_key text, existing_fee_id uuid, existing_paid boolean,
              legacy_fee_id uuid, legacy_paid boolean, action text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid;
BEGIN
  SELECT club_id INTO v_club FROM public.tournaments WHERE id = p_champ;
  IF NOT public.is_club_admin(auth.uid(), v_club) THEN RAISE EXCEPTION 'not authorised'; END IF;
  RETURN QUERY
  SELECT l.registration_id, l.club_member_id, m.name, m.email,
         (m.email IS NOT NULL AND (SELECT count(*) FROM public.club_members m2 WHERE m2.club_id = m.club_id AND lower(m2.email) = lower(m.email)) > 1),
         l.division, l.amount_cents, l.charge_key, f.id, f.paid, lf.id, lf.paid,
         CASE WHEN m.id IS NULL OR m.club_id <> v_club THEN 'blocked_missing_member'
              WHEN f.id IS NOT NULL THEN 'skip_existing'
              WHEN lf.id IS NOT NULL THEN 'blocked_legacy_fee'
              WHEN coalesce(l.amount_cents,0) <= 0 THEN 'skip_zero'
              ELSE 'create' END
    FROM public.champ_registration_fee_lines(p_champ) l
    LEFT JOIN public.club_members m ON m.id = l.club_member_id
    LEFT JOIN public.club_member_fee_payments f ON f.champ_charge_key = l.charge_key
    LEFT JOIN public.club_champs_registrations r ON r.id = l.registration_id
    LEFT JOIN public.club_member_fee_payments lf ON lf.id = r.fee_payment_id AND lf.champ_charge_key IS NULL
   ORDER BY m.name, l.division;
END $$;

CREATE OR REPLACE FUNCTION public.champ_set_entry_fee_basis(p_champ uuid, p_basis text, p_mixed_rule text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid;
BEGIN
  SELECT club_id INTO v_club FROM public.tournaments WHERE id = p_champ;
  IF NOT public.is_club_admin(auth.uid(), v_club) THEN RAISE EXCEPTION 'not authorised'; END IF;
  UPDATE public.tournaments SET entry_fee_basis = p_basis, entry_fee_mixed_rule = p_mixed_rule,
         entry_fee_basis_set_at = now(), entry_fee_basis_set_by = auth.uid() WHERE id = p_champ;
  INSERT INTO public.audit_events (club_id, actor_user_id, action, entity_type, entity_id, details)
  SELECT v_club, auth.uid(), 'champ_fee_basis_set', 'tournament', p_champ, jsonb_build_object('basis', p_basis, 'mixed_rule', p_mixed_rule)
  WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_events' AND column_name='actor_user_id');
END $$;

-- Posts charges. Caller must echo the previewed total; idempotent via unique charge key.
CREATE OR REPLACE FUNCTION public.champ_fee_post_charges(p_champ uuid, p_expected_total_cents bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_name text; v_total bigint; v_n int := 0; rec record; v_id uuid;
BEGIN
  SELECT club_id, name INTO v_club, v_name FROM public.tournaments WHERE id = p_champ FOR UPDATE;
  IF NOT public.is_club_admin(auth.uid(), v_club) THEN RAISE EXCEPTION 'not authorised'; END IF;
  IF (SELECT entry_fee_basis FROM public.tournaments WHERE id = p_champ) IS NULL THEN RAISE EXCEPTION 'Fee basis needs confirmation'; END IF;
  IF EXISTS (SELECT 1 FROM public.champ_fee_charge_preview(p_champ) WHERE action LIKE 'blocked%') THEN RAISE EXCEPTION 'Preview has blocked rows'; END IF;
  SELECT coalesce(sum(amount_cents),0) INTO v_total FROM public.champ_fee_charge_preview(p_champ) WHERE action = 'create';
  IF v_total <> p_expected_total_cents THEN RAISE EXCEPTION 'Totals changed since preview (% vs %)', v_total, p_expected_total_cents; END IF;
  FOR rec IN SELECT * FROM public.champ_fee_charge_preview(p_champ) WHERE action = 'create' LOOP
    INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, champ_registration_id, champ_charge_key, invoice_issued_at)
    VALUES (rec.club_member_id, 'tournament_entry', coalesce(v_name,'Tournament') || ' entry' || coalesce(' (category '||rec.division||')',''),
            rec.amount_cents / 100.0, false, rec.registration_id, rec.charge_key, now())
    ON CONFLICT (champ_charge_key) WHERE champ_charge_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_n := v_n + 1;
      UPDATE public.club_champs_registrations SET fee_payment_id = coalesce(fee_payment_id, v_id) WHERE id = rec.registration_id;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.champ_payment_claim_submit(p_champ uuid, p_method text, p_paid_on date, p_reference text,
  p_amount_cents integer, p_proof_path text, p_allocations jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_id uuid; a jsonb; v_sum int := 0; v_admin boolean;
BEGIN
  SELECT club_id INTO v_club FROM public.tournaments WHERE id = p_champ;
  IF v_club IS NULL THEN RAISE EXCEPTION 'unknown tournament'; END IF;
  v_admin := public.is_club_admin(auth.uid(), v_club);
  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN RAISE EXCEPTION 'Choose at least one member'; END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.club_champs_registrations r WHERE r.champ_id = p_champ AND r.club_member_id = (a->>'club_member_id')::uuid) THEN
      RAISE EXCEPTION 'Member is not entered in this tournament'; END IF;
    IF NOT v_admin AND NOT public.champ_user_can_act_for_member((a->>'club_member_id')::uuid, auth.uid()) THEN
      RAISE EXCEPTION 'You cannot report payment for this member'; END IF;
    v_sum := v_sum + (a->>'amount_cents')::int;
  END LOOP;
  IF v_sum <> p_amount_cents THEN RAISE EXCEPTION 'Split must add up to the amount paid'; END IF;
  INSERT INTO public.champ_payment_claims (club_id, champ_id, claimant_user_id, recorded_by_admin, method, paid_on, reference, amount_cents, proof_path)
  VALUES (v_club, p_champ, auth.uid(), v_admin AND coalesce((p_allocations->0->>'admin')::boolean,false), p_method, p_paid_on, nullif(trim(p_reference),''), p_amount_cents, p_proof_path)
  RETURNING id INTO v_id;
  INSERT INTO public.champ_payment_claim_allocations (claim_id, club_member_id, registration_id, amount_cents, created_by)
  SELECT v_id, (x->>'club_member_id')::uuid,
         (SELECT r.id FROM public.club_champs_registrations r WHERE r.champ_id = p_champ AND r.club_member_id = (x->>'club_member_id')::uuid LIMIT 1),
         (x->>'amount_cents')::int, auth.uid()
    FROM jsonb_array_elements(p_allocations) x;
  RETURN v_id;
END $$;

-- Admin review. Approve settles each allocated member's unpaid tournament charge; refuses double posting.
CREATE OR REPLACE FUNCTION public.champ_payment_claim_review(p_claim uuid, p_action text, p_reason text, p_allocations jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; al record; v_due int; v_paid_by uuid; v_sum int;
BEGIN
  SELECT * INTO c FROM public.champ_payment_claims WHERE id = p_claim FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'unknown claim'; END IF;
  IF NOT public.is_club_admin(auth.uid(), c.club_id) THEN RAISE EXCEPTION 'not authorised'; END IF;
  IF c.status IN ('approved','rejected') THEN RAISE EXCEPTION 'Claim already %', c.status; END IF;
  IF p_action IN ('reject','needs_proof') THEN
    UPDATE public.champ_payment_claims SET status = CASE p_action WHEN 'reject' THEN 'rejected' ELSE 'needs_proof' END,
      review_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p_claim;
    RETURN;
  END IF;
  IF p_action <> 'approve' THEN RAISE EXCEPTION 'bad action'; END IF;
  IF (SELECT entry_fee_basis FROM public.tournaments WHERE id = c.champ_id) IS NULL THEN RAISE EXCEPTION 'Fee basis needs confirmation'; END IF;
  IF p_allocations IS NOT NULL THEN
    SELECT coalesce(sum((x->>'amount_cents')::int),0) INTO v_sum FROM jsonb_array_elements(p_allocations) x;
    IF v_sum <> c.amount_cents THEN RAISE EXCEPTION 'Split must add up to the amount paid'; END IF;
    DELETE FROM public.champ_payment_claim_allocations WHERE claim_id = p_claim;
    INSERT INTO public.champ_payment_claim_allocations (claim_id, club_member_id, registration_id, amount_cents, created_by)
    SELECT p_claim, (x->>'club_member_id')::uuid,
           (SELECT r.id FROM public.club_champs_registrations r WHERE r.champ_id = c.champ_id AND r.club_member_id = (x->>'club_member_id')::uuid LIMIT 1),
           (x->>'amount_cents')::int, auth.uid()
      FROM jsonb_array_elements(p_allocations) x;
  END IF;
  SELECT club_member_id INTO v_paid_by FROM public.club_members WHERE user_id = c.claimant_user_id AND club_id = c.club_id LIMIT 1;
  FOR al IN SELECT * FROM public.champ_payment_claim_allocations WHERE claim_id = p_claim LOOP
    SELECT coalesce(sum(round(f.amount*100)),0)::int INTO v_due FROM public.club_member_fee_payments f
     WHERE f.club_member_id = al.club_member_id AND f.champ_charge_key LIKE 'champ:'||c.champ_id||':'||al.club_member_id||':%' AND NOT f.paid;
    IF v_due = 0 THEN RAISE EXCEPTION 'No unpaid charge for a member — post charges first or it is already paid'; END IF;
    IF al.amount_cents <> v_due THEN RAISE EXCEPTION 'Allocated amount (%) must equal the member''s unpaid charge (%)', al.amount_cents, v_due; END IF;
    UPDATE public.club_member_fee_payments f SET paid = true, paid_at = coalesce(c.paid_on::timestamptz, now())
     WHERE f.club_member_id = al.club_member_id AND f.champ_charge_key LIKE 'champ:'||c.champ_id||':'||al.club_member_id||':%' AND NOT f.paid;
    UPDATE public.club_champs_registrations SET payment_ref = coalesce(c.reference, payment_ref), proof_url = coalesce(c.proof_path, proof_url) WHERE id = al.registration_id;
    UPDATE public.champ_payment_claim_allocations SET fee_payment_id = (SELECT fee_payment_id FROM public.club_champs_registrations WHERE id = al.registration_id) WHERE id = al.id;
  END LOOP;
  UPDATE public.champ_payment_claims SET status = 'approved', review_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p_claim;
END $$;

REVOKE ALL ON FUNCTION public.champ_registration_fee_lines(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.champ_fee_charge_preview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.champ_set_entry_fee_basis(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.champ_fee_post_charges(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.champ_payment_claim_submit(uuid, text, date, text, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.champ_payment_claim_review(uuid, text, text, jsonb) TO authenticated;
