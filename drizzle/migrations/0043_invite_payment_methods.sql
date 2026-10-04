CREATE OR REPLACE FUNCTION public._invite_reg_id(p_token text)
 RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_token text := trim(coalesce(p_token,'')); v_id uuid;
BEGIN
  IF v_token = '' THEN RETURN NULL; END IF;
  IF length(v_token) < 32 THEN
    SELECT isc.invite_token INTO v_token FROM public.invite_short_codes isc
     WHERE isc.code = regexp_replace(lower(v_token), '[^a-z0-9]+$', '');
  END IF;
  SELECT id INTO v_id FROM public.club_champs_registrations
   WHERE invite_token = v_token AND invite_revoked_at IS NULL;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public._invite_reg_id(text) FROM PUBLIC, anon, authenticated;

-- Methods the player may choose: the tournament's chosen methods that the host
-- club can actually accept (Banking settings); if none were chosen, everything
-- the club accepts. Member account is always possible for club members.
CREATE OR REPLACE FUNCTION public._champ_payment_methods(p_champ_id uuid)
 RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c record; cl record; v_bank boolean; v_ok text[] := ARRAY[]::text[]; v_acc text[]; v_out text[];
BEGIN
  SELECT * INTO c FROM public.club_champs WHERE id = p_champ_id;
  IF NOT FOUND THEN RETURN ARRAY[]::text[]; END IF;
  SELECT payment_gateway, accepted_payment_methods INTO cl FROM public.clubs WHERE id = c.club_id;
  v_acc := coalesce(cl.accepted_payment_methods, ARRAY['cash','eft','online']);
  SELECT EXISTS (SELECT 1 FROM public.club_secrets s WHERE s.club_id = c.club_id
                  AND (nullif(trim(s.bank_account_number),'') IS NOT NULL OR nullif(trim(s.bank_name),'') IS NOT NULL)) INTO v_bank;
  IF 'online' = ANY(v_acc) AND nullif(trim(coalesce(cl.payment_gateway,'')),'') IS NOT NULL THEN v_ok := v_ok || 'card'; END IF;
  IF 'eft' = ANY(v_acc) AND v_bank THEN v_ok := v_ok || 'eft'; END IF;
  IF 'cash' = ANY(v_acc) THEN v_ok := v_ok || 'cash'; END IF;
  v_ok := v_ok || 'account';
  IF coalesce(cardinality(c.payment_methods),0) = 0 THEN RETURN v_ok; END IF;
  SELECT coalesce(array_agg(m ORDER BY array_position(v_ok, m)), ARRAY[]::text[]) INTO v_out
    FROM unnest(v_ok) m WHERE m = ANY(c.payment_methods);
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public._champ_payment_methods(uuid) FROM PUBLIC, anon, authenticated;

-- Everything this invitee owes: own events plus partner events they cover.
CREATE OR REPLACE FUNCTION public._invite_amount_cents(p_reg_id uuid)
 RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record; v_own int := 0; v_pair int := 0;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_reg_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF NOT (lower(coalesce(r.fee_status,'')) IN ('paid','waived') OR r.paid_at IS NOT NULL OR r.fee_settled_via IS NOT NULL) THEN
    v_own := coalesce(public.champ_reg_own_due_cents(r.id), 0);
  END IF;
  SELECT coalesce(sum(public.champ_division_fee_cents(p.champ_id, p.group_number)), 0) INTO v_pair
    FROM public.champ_doubles_pairs p
   WHERE p.champ_id = r.champ_id AND p.pays_for_partner AND p.payer_member_id = r.club_member_id
     AND p.status IN ('awaiting_payment','pending')
     AND NOT public.champ_member_event_paid(p.champ_id,
           CASE WHEN p.member_a = r.club_member_id THEN p.member_b ELSE p.member_a END, p.group_number);
  RETURN v_own + v_pair;
END $$;
REVOKE ALL ON FUNCTION public._invite_amount_cents(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.invite_payment_options(p_token text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; r record;
BEGIN
  v_id := public._invite_reg_id(p_token);
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = v_id;
  RETURN jsonb_build_object('ok', true,
    'methods', to_jsonb(public._champ_payment_methods(r.champ_id)),
    'amount_cents', public._invite_amount_cents(v_id),
    'status', r.status, 'fee_settled_via', r.fee_settled_via);
END $$;
GRANT EXECUTE ON FUNCTION public.invite_payment_options(text) TO anon, authenticated;

-- Settle by member account, EFT or cash straight from the invitation.
CREATE OR REPLACE FUNCTION public.invite_settle_entry(p_token text, p_verify text, p_method text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; r record; m record; c record; v_amount int; v_bank record; p record;
        v_partner uuid; v_preg uuid; v_bill uuid; v_pname text; v_fee numeric;
BEGIN
  IF p_method NOT IN ('account','eft','cash') THEN RAISE EXCEPTION 'Choose a payment method'; END IF;
  v_id := public._invite_reg_id(p_token);
  IF v_id IS NULL THEN RAISE EXCEPTION 'This invitation is no longer valid'; END IF;
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = v_id FOR UPDATE;
  SELECT * INTO m FROM public.club_members WHERE id = r.club_member_id;
  IF NOT ((auth.uid() IS NOT NULL AND (m.user_id = auth.uid() OR public.member_is_delegate_of(m.id, auth.uid())))
          OR public.invite_verification_ok(m.id, p_verify)) THEN
    RAISE EXCEPTION 'Please verify this invitation first';
  END IF;
  IF lower(coalesce(r.status,'')) IN ('cancelled','declined','withdrawn','invited') THEN
    RAISE EXCEPTION 'Enter the tournament before paying';
  END IF;
  IF NOT (p_method = ANY(public._champ_payment_methods(r.champ_id))) THEN
    RAISE EXCEPTION 'That payment method is not available for this tournament';
  END IF;
  SELECT id, name, club_id, start_date INTO c FROM public.club_champs WHERE id = r.champ_id;
  v_amount := public._invite_amount_cents(v_id);
  IF v_amount <= 0 THEN RETURN jsonb_build_object('ok', true, 'nothing_due', true); END IF;

  PERFORM public.ensure_tournament_entry_fee(v_id);

  IF p_method = 'account' THEN
    UPDATE public.club_champs_registrations SET fee_settled_via = 'account', fee_settled_via_at = now()
     WHERE id = v_id AND fee_settled_via IS NULL AND paid_at IS NULL;
    -- Partner events this player covers go on the payer's account too.
    FOR p IN SELECT * FROM public.champ_doubles_pairs
              WHERE champ_id = r.champ_id AND pays_for_partner AND payer_member_id = r.club_member_id
                AND status IN ('awaiting_payment','pending') LOOP
      v_partner := CASE WHEN p.member_a = r.club_member_id THEN p.member_b ELSE p.member_a END;
      IF public.champ_member_event_paid(r.champ_id, v_partner, p.group_number) THEN CONTINUE; END IF;
      SELECT id INTO v_preg FROM public.club_champs_registrations
       WHERE champ_id = r.champ_id AND club_member_id = v_partner
         AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn')
       ORDER BY created_at DESC LIMIT 1;
      IF v_preg IS NULL THEN CONTINUE; END IF;
      v_bill := public.resolve_host_billing_member(r.club_member_id, c.club_id);
      v_fee := public.champ_division_fee_cents(r.champ_id, p.group_number)::numeric / 100;
      SELECT name INTO v_pname FROM public.club_members WHERE id = v_partner;
      INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
      VALUES (v_bill, 'tournament_entry', coalesce(c.name,'Tournament') || ' entry fee – for ' || coalesce(v_pname,'partner')
              || ' (event ' || p.group_number || ')', v_fee, false,
              EXTRACT(YEAR FROM coalesce(c.start_date, now()))::int)
      ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO UPDATE SET updated_at = now();
      PERFORM public.champ_mark_event_cover(v_preg, p.group_number, r.club_member_id, 'account', NULL);
      PERFORM public.champ_pair_settle(p.id);
    END LOOP;
    FOR p IN SELECT id FROM public.champ_doubles_pairs WHERE champ_id = r.champ_id
              AND r.club_member_id IN (member_a, member_b) AND status = 'awaiting_payment' LOOP
      PERFORM public.champ_pair_settle(p.id);
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'method', 'account', 'amount_cents', v_amount);
  END IF;

  UPDATE public.club_champs_registrations SET status = CASE WHEN p_method = 'eft' THEN 'pending_eft' ELSE status END
   WHERE id = v_id AND status = 'pending_payment';

  IF p_method = 'eft' THEN
    SELECT s.bank_name, s.bank_account_name, s.bank_account_number, s.bank_branch_code
      INTO v_bank FROM public.club_secrets s WHERE s.club_id = c.club_id LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'method', 'eft', 'amount_cents', v_amount,
      'bank_name', v_bank.bank_name, 'bank_account_name', v_bank.bank_account_name,
      'bank_account_number', v_bank.bank_account_number, 'bank_branch_code', v_bank.bank_branch_code,
      'reference', left(regexp_replace(coalesce(m.name,'Entry'), '\s+', ' ', 'g'), 20) || ' ' || left(coalesce(c.name,''), 10));
  END IF;
  RETURN jsonb_build_object('ok', true, 'method', 'cash', 'amount_cents', v_amount);
END $$;
GRANT EXECUTE ON FUNCTION public.invite_settle_entry(text, text, text) TO anon, authenticated;