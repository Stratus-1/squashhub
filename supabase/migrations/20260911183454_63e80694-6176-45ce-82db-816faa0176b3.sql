CREATE OR REPLACE FUNCTION public.ensure_tournament_entry_fee(p_registration_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg record;
  v_champ record;
  v_amount numeric;
  v_label text;
  v_fee_id uuid;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_reg.fee_payment_id IS NOT NULL THEN RETURN v_reg.fee_payment_id; END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_amount := COALESCE(public.champ_entry_fee_cents(v_reg.champ_id), COALESCE(v_champ.entry_fee_cents, 0))::numeric / 100;
  IF v_amount <= 0 THEN RETURN NULL; END IF;

  v_label := COALESCE(v_champ.name, 'Tournament') || ' entry fee';

  INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
  VALUES (v_reg.club_member_id, 'tournament_entry', v_label, v_amount, false,
          EXTRACT(YEAR FROM COALESCE(v_champ.start_date, now()))::int)
  ON CONFLICT (club_member_id, fee_type, fee_label, season_year)
  DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()
  RETURNING id INTO v_fee_id;

  UPDATE public.club_champs_registrations
     SET fee_payment_id = COALESCE(fee_payment_id, v_fee_id)
   WHERE id = p_registration_id;

  RETURN v_fee_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_registration_ensure_entry_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(COALESCE(NEW.status, '')) IN ('pending_payment', 'pending_eft')
     AND NEW.fee_payment_id IS NULL THEN
    PERFORM public.ensure_tournament_entry_fee(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_registration_ensure_entry_fee ON public.club_champs_registrations;
CREATE TRIGGER trg_registration_ensure_entry_fee
AFTER INSERT OR UPDATE OF status ON public.club_champs_registrations
FOR EACH ROW EXECUTE FUNCTION public.tg_registration_ensure_entry_fee();

CREATE OR REPLACE FUNCTION public.charge_tournament_entry_to_account(p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg record;
  v_member record;
  v_fee_id uuid;
  v_amount numeric;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF v_member.user_id IS NULL OR v_member.user_id <> auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.member_account_delegations d
      WHERE d.member_id = v_reg.club_member_id
        AND d.status = 'accepted'
        AND d.delegate_member_id IN (SELECT id FROM public.club_members WHERE user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Not authorised for this registration';
    END IF;
  END IF;

  v_fee_id := public.ensure_tournament_entry_fee(p_registration_id);
  IF v_fee_id IS NULL THEN
    RETURN jsonb_build_object('charged', false, 'reason', 'no_fee');
  END IF;

  SELECT amount INTO v_amount FROM public.club_member_fee_payments WHERE id = v_fee_id;
  RETURN jsonb_build_object('charged', true, 'fee_payment_id', v_fee_id, 'amount', v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.charge_tournament_entry_to_account(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.charge_tournament_entry_to_account(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.ensure_tournament_entry_fee(uuid) FROM public;