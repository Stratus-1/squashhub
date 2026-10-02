-- One authoritative "is this entry fee settled?" for tournament entries:
-- card/EFT receipts, waivers AND member-account allocation (fee_status 'on_account') all count.
CREATE OR REPLACE FUNCTION public.champ_member_fee_settled(p_champ_id uuid, p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.champ_member_fee_paid(p_champ_id, p_member_id)
      OR EXISTS (SELECT 1 FROM public.club_champs_registrations r
                  WHERE r.champ_id = p_champ_id AND r.club_member_id = p_member_id
                    AND lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn')
                    AND (r.fee_settled_via = 'account' OR lower(coalesce(r.fee_status,'')) IN ('paid','waived','on_account')));
$$;
REVOKE ALL ON FUNCTION public.champ_member_fee_settled(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.champ_member_fee_settled(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.step_pair_payment_context(
  p_registration_id uuid, p_token text DEFAULT NULL, p_verify text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL, p_scope text DEFAULT 'options')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_reg record; v_partner record; v_me record; v_pm record; v_t record; v_c record;
  v_actor uuid; v_fee int; v_me_owes boolean; v_p_owes boolean; v_enabled boolean; v_guest boolean := false;
  v_verified boolean := true; v_pname text; v_account boolean;
BEGIN
  v_actor := CASE WHEN auth.uid() IS NOT NULL THEN auth.uid()
                  WHEN coalesce(auth.role(),'') = 'service_role' THEN p_user_id ELSE NULL END;
  IF p_token IS NOT NULL AND length(p_token) >= 32 THEN
    SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token AND invite_revoked_at IS NULL;
  ELSE
    SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Entry not found'); END IF;
  SELECT id, club_id, user_id, name INTO v_me FROM public.club_members WHERE id = v_reg.club_member_id;

  IF NOT (v_actor IS NOT NULL AND v_actor = v_me.user_id) THEN
    IF v_actor IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.member_account_delegations d
       WHERE d.member_id = v_reg.club_member_id AND d.status = 'accepted'
         AND d.delegate_member_id IN (SELECT id FROM public.club_members WHERE user_id = v_actor)) THEN
      NULL;
    ELSIF p_token IS NOT NULL AND length(p_token) >= 32 THEN
      v_guest := true;
      v_verified := public.invite_verification_ok(v_reg.club_member_id, p_verify);
      IF NOT v_verified AND p_scope <> 'options' THEN
        RETURN jsonb_build_object('ok', false, 'needs_verification', true, 'error', 'We could not verify that this invitation is yours. Please check the detail you entered.');
      END IF;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Not authorised for this entry');
    END IF;
  END IF;

  SELECT id, name, beta_lifecycle INTO v_t FROM public.tournaments WHERE id = v_reg.champ_id;
  SELECT payment_methods INTO v_c FROM public.club_champs WHERE id = v_reg.champ_id;
  v_enabled := coalesce((v_t.beta_lifecycle->>'partner_pay')::boolean, false);
  v_account := coalesce('account' = ANY(v_c.payment_methods), false);
  v_fee := coalesce(public.champ_entry_fee_cents(v_reg.champ_id), 0);

  IF v_reg.partner_member_id IS NOT NULL THEN
    SELECT * INTO v_partner FROM public.club_champs_registrations
     WHERE champ_id = v_reg.champ_id AND club_member_id = v_reg.partner_member_id
       AND partner_member_id = v_reg.club_member_id
       AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn');
  END IF;

  v_me_owes := lower(coalesce(v_reg.status,'')) NOT IN ('cancelled','declined','withdrawn')
               AND NOT public.champ_member_fee_settled(v_reg.champ_id, v_reg.club_member_id);
  v_p_owes := v_partner.id IS NOT NULL
              AND NOT public.champ_member_fee_settled(v_reg.champ_id, v_partner.club_member_id);

  IF v_partner.id IS NOT NULL THEN
    SELECT name INTO v_pm FROM public.club_members WHERE id = v_partner.club_member_id;
    v_pname := CASE WHEN v_guest
      THEN split_part(trim(coalesce(v_pm.name,'')), ' ', 1) || coalesce(' ' || nullif(left(regexp_replace(trim(coalesce(v_pm.name,'')), '^\S+\s*', ''), 1), '') || '.', '')
      ELSE coalesce(v_pm.name, 'your partner') END;
  END IF;

  IF p_scope = 'options' THEN
    RETURN jsonb_build_object('ok', true, 'enabled', v_enabled AND v_fee > 0 AND v_partner.id IS NOT NULL,
      'partner_name', v_pname, 'partner_owes', coalesce(v_p_owes,false), 'me_owes', v_me_owes,
      'fee_cents', v_fee, 'account_allowed', v_account, 'needs_verification', NOT v_verified,
      'partner_settled_via', CASE WHEN v_partner.id IS NULL THEN NULL WHEN v_partner.fee_settled_via = 'account' THEN 'account'
                                  WHEN NOT coalesce(v_p_owes,false) THEN 'paid' END);
  END IF;

  IF NOT v_enabled OR v_fee <= 0 OR v_partner.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Paying for your partner is not available for this tournament');
  END IF;
  IF NOT coalesce(v_p_owes,false) THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'Your partner''s entry fee is already settled');
  END IF;
  IF p_scope = 'both' AND NOT v_me_owes THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'Your own entry fee is already settled — pay your partner''s fee only');
  END IF;
  IF p_scope NOT IN ('partner','both') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid payment choice');
  END IF;

  RETURN jsonb_build_object('ok', true,
    'club_id', v_me.club_id, 'club_member_id', v_me.id, 'user_id', v_me.user_id,
    'my_registration_id', v_reg.id, 'partner_registration_id', v_partner.id,
    'registration_id', CASE WHEN p_scope = 'partner' THEN v_partner.id ELSE v_reg.id END,
    'cover_registration_ids', CASE WHEN p_scope = 'both' THEN jsonb_build_array(v_partner.id) ELSE '[]'::jsonb END,
    'payer_member_id', v_me.id, 'account_allowed', v_account, 'partner_name', v_pname,
    'amount', (v_fee * CASE WHEN p_scope = 'both' THEN 2 ELSE 1 END)::numeric / 100,
    'description', coalesce(v_t.name,'Tournament') || CASE WHEN p_scope = 'both' THEN ' entry fees (you and ' || coalesce(v_pname,'partner') || ')' ELSE ' entry fee for ' || coalesce(v_pname,'your partner') END);
END;
$$;
REVOKE ALL ON FUNCTION public.step_pair_payment_context(uuid, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.step_pair_payment_context(uuid, text, text, uuid, text) TO anon, authenticated, service_role;

-- Member-account allocation for an organiser-made pair: the payer's club account carries the debt.
CREATE OR REPLACE FUNCTION public.step_charge_pair_to_account(
  p_registration_id uuid, p_token text DEFAULT NULL, p_verify text DEFAULT NULL, p_scope text DEFAULT 'partner')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ctx jsonb; v_champ record; v_partner record; v_mine record; v_pfee record; v_payer uuid; v_bill uuid;
  v_amount numeric; v_fee_id uuid; v_ref uuid; v_pname text;
BEGIN
  IF p_scope NOT IN ('partner','both') THEN RAISE EXCEPTION 'Invalid payment choice'; END IF;
  v_ctx := public.step_pair_payment_context(p_registration_id, p_token, p_verify, NULL, p_scope);
  IF NOT coalesce((v_ctx->>'ok')::boolean, false) THEN RETURN v_ctx; END IF;
  IF NOT coalesce((v_ctx->>'account_allowed')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Member-account payment is not enabled for this tournament');
  END IF;

  SELECT * INTO v_partner FROM public.club_champs_registrations WHERE id = (v_ctx->>'partner_registration_id')::uuid FOR UPDATE;
  SELECT * INTO v_mine FROM public.club_champs_registrations WHERE id = (v_ctx->>'my_registration_id')::uuid FOR UPDATE;
  IF v_partner.fee_settled_via IS NOT NULL OR public.champ_member_fee_settled(v_partner.champ_id, v_partner.club_member_id) THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'Your partner''s entry fee is already settled');
  END IF;
  SELECT c.id, c.name, c.club_id, c.start_date INTO v_champ FROM public.club_champs c WHERE c.id = v_partner.champ_id;
  v_payer := v_mine.club_member_id;
  v_bill := public.resolve_host_billing_member(v_payer, v_champ.club_id);
  v_amount := coalesce(public.champ_entry_fee_cents(v_partner.champ_id), 0)::numeric / 100;
  SELECT name INTO v_pname FROM public.club_members WHERE id = v_partner.club_member_id;

  IF v_partner.fee_payment_id IS NOT NULL THEN
    SELECT * INTO v_pfee FROM public.club_member_fee_payments WHERE id = v_partner.fee_payment_id;
    IF FOUND THEN
      IF v_pfee.paid THEN
        RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'Your partner''s entry fee is already paid');
      END IF;
      IF v_pfee.invoice_issued_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Your partner has already been invoiced for this fee — pay it by card instead, or ask the club');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.club_champs_registrations o WHERE o.fee_payment_id = v_pfee.id AND o.id <> v_partner.id) THEN
        IF coalesce(v_pfee.amount,0) > 0 THEN
          v_ref := gen_random_uuid();
          INSERT INTO public.club_journal_entries (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
          VALUES (v_champ.club_id, v_pfee.club_member_id, NULL, 'tournament_income', v_pfee.amount, 0, 'Entry fee moved to partner''s account: ' || coalesce(v_pfee.fee_label,''), v_ref),
                 (v_champ.club_id, v_pfee.club_member_id, NULL, 'debtors', 0, v_pfee.amount, 'Entry fee moved to partner''s account: ' || coalesce(v_pfee.fee_label,''), v_ref);
          INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, after_json, note)
          VALUES (v_champ.club_id, v_ref, 'reverse', auth.uid(),
                  jsonb_build_object('registration_id', v_partner.id, 'fee_payment_id', v_pfee.id, 'amount', v_pfee.amount,
                                     'from_member_id', v_pfee.club_member_id, 'to_member_id', v_bill),
                  'Doubles partner chose to carry this entry fee on their own member account');
        END IF;
        UPDATE public.club_champs_registrations SET fee_payment_id = NULL WHERE id = v_partner.id;
        DELETE FROM public.club_member_fee_payments WHERE id = v_pfee.id AND paid = false;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
  VALUES (v_bill, 'tournament_entry', coalesce(v_champ.name,'Tournament') || ' entry fee – for ' || coalesce(v_pname,'partner'),
          v_amount, false, EXTRACT(YEAR FROM coalesce(v_champ.start_date, now()))::int)
  ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_fee_id;

  UPDATE public.club_champs_registrations
     SET fee_payment_id = v_fee_id, fee_settled_via = 'account', fee_settled_via_at = now(), paid_by_member_id = v_payer
   WHERE id = v_partner.id;

  IF p_scope = 'both' AND v_mine.fee_settled_via IS NULL AND NOT public.champ_member_fee_settled(v_mine.champ_id, v_payer) THEN
    PERFORM public.ensure_tournament_entry_fee(v_mine.id);
    UPDATE public.club_champs_registrations SET fee_settled_via = 'account', fee_settled_via_at = now()
     WHERE id = v_mine.id AND fee_settled_via IS NULL;
  END IF;

  RETURN jsonb_build_object('ok', true, 'charged', true, 'scope', p_scope,
    'amount', v_amount * CASE WHEN p_scope = 'both' THEN 2 ELSE 1 END, 'partner_name', v_ctx->>'partner_name');
END;
$$;
REVOKE ALL ON FUNCTION public.step_charge_pair_to_account(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.step_charge_pair_to_account(uuid, text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_tournament_invite(p_token text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_base jsonb; v_reg record; v_champ record; v_partner text; v_cat text;
  v_token text := trim(COALESCE(p_token, ''));
BEGIN
  v_base := public.get_tournament_invite_base(p_token);
  IF NOT COALESCE((v_base->>'found')::boolean, false) THEN RETURN v_base; END IF;
  IF length(v_token) < 32 THEN
    SELECT isc.invite_token INTO v_token FROM public.invite_short_codes isc
     WHERE isc.code = regexp_replace(lower(v_token), '[^a-z0-9]+$', '');
  END IF;
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = v_token;
  IF NOT FOUND THEN RETURN v_base; END IF;
  SELECT group_labels INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF v_reg.partner_member_id IS NOT NULL THEN
    SELECT NULLIF(trim(name), '') INTO v_partner FROM public.club_members WHERE id = v_reg.partner_member_id;
    IF v_partner IS NOT NULL AND position(' ' IN v_partner) > 0 THEN
      v_partner := split_part(v_partner, ' ', 1) || ' ' || upper(left(split_part(v_partner, ' ', 2), 1)) || '.';
    END IF;
  END IF;
  IF COALESCE(array_length(v_reg.division_choices, 1), 0) > 0 THEN
    v_cat := NULLIF(v_champ.group_labels ->> (v_reg.division_choices[1])::text, '');
  END IF;
  RETURN v_base || jsonb_build_object(
    'admin_entered', COALESCE(v_reg.invited_by_admin, false)
        AND (v_reg.registration_source = 'admin' OR v_reg.confirmation_source = 'admin'),
    'partner_name', v_partner,
    'entry_category', v_cat,
    'fee_status', v_reg.fee_status,
    'fee_settled_via', v_reg.fee_settled_via
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tournament_invite_payment_context(p_token text, p_verify text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record; v_champ record; v_member record; v_fee integer; v_due_count integer;
  v_amount numeric; v_covered jsonb; v_actor uuid;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid');
  END IF;
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND OR v_reg.invite_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid');
  END IF;
  SELECT id, club_id, name, email, phone, user_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid'); END IF;
  v_actor := COALESCE(auth.uid(), p_user_id);
  IF NOT (v_actor IS NOT NULL AND v_member.user_id IS NOT NULL AND v_actor = v_member.user_id) THEN
    IF NOT public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
      RETURN jsonb_build_object('ok', false, 'needs_verification', true,
        'error', 'We could not verify that this invitation is yours. Please check the detail you entered.');
    END IF;
  END IF;
  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid'); END IF;

  -- Already settled another way (member account, card, waived): never start a second payment.
  IF v_reg.fee_settled_via = 'account' THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'This entry fee is already charged to the member account — settle it from My Account');
  END IF;
  IF lower(coalesce(v_reg.fee_status,'')) IN ('paid','waived') THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'This entry fee is already paid');
  END IF;

  v_fee := COALESCE(public.champ_entry_fee_cents(v_reg.champ_id), 0);
  IF v_fee <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'This tournament has no entry fee to pay'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.champ_doubles_pairs p
     WHERE p.champ_id = v_reg.champ_id AND p.status IN ('pending','awaiting_payment','confirmed')
       AND p.pays_for_partner AND COALESCE(p.payer_member_id, p.proposed_by) <> v_reg.club_member_id
       AND v_reg.club_member_id IN (p.member_a, p.member_b)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The family member who created your pair is paying your entry fee');
  END IF;

  SELECT count(DISTINCT member_id)::int,
         COALESCE(jsonb_agg(DISTINCT member_id) FILTER (WHERE member_id <> v_reg.club_member_id), '[]'::jsonb)
    INTO v_due_count, v_covered
    FROM (
      SELECT v_reg.club_member_id AS member_id
      UNION ALL
      SELECT p.member_a FROM public.champ_doubles_pairs p
       WHERE p.champ_id = v_reg.champ_id AND p.pays_for_partner
         AND COALESCE(p.payer_member_id, p.proposed_by) = v_reg.club_member_id
         AND p.status IN ('pending','awaiting_payment','confirmed')
      UNION ALL
      SELECT p.member_b FROM public.champ_doubles_pairs p
       WHERE p.champ_id = v_reg.champ_id AND p.pays_for_partner
         AND COALESCE(p.payer_member_id, p.proposed_by) = v_reg.club_member_id
         AND p.status IN ('pending','awaiting_payment','confirmed')
    ) covered
   WHERE NOT public.champ_member_fee_settled(v_reg.champ_id, covered.member_id);

  IF COALESCE(v_due_count, 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'There is nothing outstanding on this entry');
  END IF;

  v_amount := (v_fee * v_due_count)::numeric / 100;
  RETURN jsonb_build_object(
    'ok', true, 'club_id', v_member.club_id, 'club_member_id', v_member.id, 'registration_id', v_reg.id,
    'champ_id', v_reg.champ_id, 'user_id', v_member.user_id, 'amount', v_amount,
    'fee_payment_id', v_reg.fee_payment_id, 'covered_member_ids', v_covered, 'covered_entries', v_due_count,
    'description', COALESCE(v_champ.name, 'Tournament') || ' entry fees (' || v_due_count || ' players)'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.charge_tournament_entry_to_account(p_registration_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record; v_member record; v_fee_id uuid; v_amount numeric; v_paid boolean;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;
  SELECT * INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF v_member.user_id IS NULL OR v_member.user_id <> auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.member_account_delegations d
      WHERE d.member_id = v_reg.club_member_id AND d.status = 'accepted'
        AND d.delegate_member_id IN (SELECT id FROM public.club_members WHERE user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Not authorised for this registration';
    END IF;
  END IF;
  IF lower(coalesce(v_reg.status,'')) IN ('cancelled','declined','withdrawn') THEN
    RAISE EXCEPTION 'This entry is no longer active';
  END IF;
  -- Paid by card / waived already: never add a second charge.
  IF lower(coalesce(v_reg.fee_status,'')) IN ('paid','waived') OR v_reg.paid_at IS NOT NULL OR coalesce(v_reg.fee_paid_cents,0) > 0 THEN
    RETURN jsonb_build_object('charged', false, 'reason', 'already_paid');
  END IF;
  v_fee_id := public.ensure_tournament_entry_fee(p_registration_id);
  IF v_fee_id IS NULL THEN
    RETURN jsonb_build_object('charged', false, 'reason', 'no_fee');
  END IF;
  SELECT amount, paid INTO v_amount, v_paid FROM public.club_member_fee_payments WHERE id = v_fee_id;
  IF v_reg.fee_settled_via = 'account' THEN
    RETURN jsonb_build_object('charged', true, 'already', true, 'fee_payment_id', v_fee_id, 'amount', v_amount);
  END IF;
  UPDATE public.club_champs_registrations
     SET fee_settled_via = 'account', fee_settled_via_at = now()
   WHERE id = p_registration_id AND fee_settled_via IS NULL;
  RETURN jsonb_build_object('charged', true, 'already', false, 'fee_payment_id', v_fee_id, 'amount', v_amount, 'fee_paid', coalesce(v_paid,false));
END;
$function$;