-- member_account_delegations uses grantor_member_id / status 'active' (not member_id / 'accepted').
CREATE OR REPLACE FUNCTION public.member_is_delegate_of(p_grantor uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.member_account_delegations d
     WHERE d.grantor_member_id = p_grantor AND d.status IN ('active','accepted') AND d.revoked_at IS NULL
       AND d.delegate_member_id IN (SELECT id FROM public.club_members WHERE user_id = p_user));
$$;
REVOKE ALL ON FUNCTION public.member_is_delegate_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_is_delegate_of(uuid, uuid) TO authenticated, service_role;

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
    IF public.member_is_delegate_of(v_reg.club_member_id, v_actor) THEN
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
    IF NOT public.member_is_delegate_of(v_reg.club_member_id, auth.uid()) THEN
      RAISE EXCEPTION 'Not authorised for this registration';
    END IF;
  END IF;
  IF lower(coalesce(v_reg.status,'')) IN ('cancelled','declined','withdrawn') THEN
    RAISE EXCEPTION 'This entry is no longer active';
  END IF;
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