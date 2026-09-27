ALTER TABLE public.member_credit_transactions
  ADD COLUMN IF NOT EXISTS fee_payment_id uuid REFERENCES public.club_member_fee_payments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_mct_fee_payment_id ON public.member_credit_transactions(fee_payment_id);

-- Find or create the member row that the HOST club bills for a tournament entrant.
CREATE OR REPLACE FUNCTION public.resolve_host_billing_member(p_club_member_id uuid, p_host_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_m public.club_members%ROWTYPE;
  v_home_name text;
  v_id uuid;
BEGIN
  SELECT * INTO v_m FROM public.club_members WHERE id = p_club_member_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_host_club_id IS NULL OR v_m.club_id = p_host_club_id THEN RETURN v_m.id; END IF;
  -- Only clubs have member ledgers; association-hosted events keep home billing.
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_host_club_id) THEN RETURN v_m.id; END IF;

  SELECT id INTO v_id FROM public.club_members
   WHERE club_id = p_host_club_id
     AND ((v_m.person_id IS NOT NULL AND person_id = v_m.person_id)
       OR (v_m.user_id IS NOT NULL AND user_id = v_m.user_id)
       OR (role = 'visitor' AND home_club_id = v_m.club_id AND lower(coalesce(name,'')) = lower(coalesce(v_m.name,''))))
   ORDER BY (role <> 'visitor') DESC, joined_at
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT name INTO v_home_name FROM public.clubs WHERE id = v_m.club_id;
  INSERT INTO public.club_members (club_id, role, name, gender, phone, person_id, home_club_id, home_club_name, billing_exempt, plays_league)
  VALUES (p_host_club_id, 'visitor', v_m.name, v_m.gender, v_m.phone, v_m.person_id, v_m.club_id, v_home_name, true, false)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_host_billing_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_host_billing_member(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_tournament_entry_fee(p_registration_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_champ record;
  v_amount numeric;
  v_label text;
  v_fee_id uuid;
  v_bill_member uuid;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_reg.fee_payment_id IS NOT NULL THEN RETURN v_reg.fee_payment_id; END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_amount := COALESCE(public.champ_entry_fee_cents(v_reg.champ_id), COALESCE(v_champ.entry_fee_cents, 0))::numeric / 100;
  IF v_amount <= 0 THEN RETURN NULL; END IF;

  v_label := COALESCE(v_champ.name, 'Tournament') || ' entry fee';
  -- Bill the club that OWNS/HOSTS the tournament, never the entrant's home club.
  v_bill_member := public.resolve_host_billing_member(v_reg.club_member_id, v_champ.club_id);

  INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
  VALUES (v_bill_member, 'tournament_entry', v_label, v_amount, false,
          EXTRACT(YEAR FROM COALESCE(v_champ.start_date, now()))::int)
  ON CONFLICT (club_member_id, fee_type, fee_label, season_year)
  DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()
  RETURNING id INTO v_fee_id;

  UPDATE public.club_champs_registrations
     SET fee_payment_id = COALESCE(fee_payment_id, v_fee_id)
   WHERE id = p_registration_id;

  RETURN v_fee_id;
END;
$function$;

-- Refuse accidental double EFT/pending submissions (same member, amount, method within 60s).
CREATE OR REPLACE FUNCTION public.member_credit_transactions_block_duplicate_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'pending' AND EXISTS (
    SELECT 1 FROM public.member_credit_transactions t
     WHERE t.club_member_id = NEW.club_member_id
       AND t.status = 'pending'
       AND t.amount = NEW.amount
       AND coalesce(t.method,'') = coalesce(NEW.method,'')
       AND t.created_at > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'A matching payment request was just submitted. Please wait for the club to confirm it.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mct_block_duplicate_pending ON public.member_credit_transactions;
CREATE TRIGGER trg_mct_block_duplicate_pending
  BEFORE INSERT ON public.member_credit_transactions
  FOR EACH ROW EXECUTE FUNCTION public.member_credit_transactions_block_duplicate_pending();