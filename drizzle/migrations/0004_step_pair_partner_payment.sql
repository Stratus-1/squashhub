-- Step-by-Step organiser-made doubles pairs: one partner may pay the other's entry fee
-- (or both together) when the tournament's Fees & Payment answer allows it
-- (tournaments.beta_lifecycle->>'partner_pay' = 'true'). Amounts are computed here, never by the client.
CREATE OR REPLACE FUNCTION public.step_pair_payment_context(
  p_registration_id uuid, p_token text DEFAULT NULL, p_verify text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL, p_scope text DEFAULT 'options')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_reg record; v_partner record; v_me record; v_pm record; v_t record;
  v_actor uuid; v_fee int; v_me_owes boolean; v_p_owes boolean; v_enabled boolean; v_guest boolean := false;
  v_pname text;
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
    IF p_token IS NOT NULL AND public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
      v_guest := true;
    ELSIF v_actor IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.member_account_delegations d
       WHERE d.member_id = v_reg.club_member_id AND d.status = 'accepted'
         AND d.delegate_member_id IN (SELECT id FROM public.club_members WHERE user_id = v_actor)) THEN
      NULL;
    ELSE
      RETURN jsonb_build_object('ok', false, 'needs_verification', p_token IS NOT NULL, 'error', 'Not authorised for this entry');
    END IF;
  END IF;

  SELECT id, name, beta_lifecycle INTO v_t FROM public.tournaments WHERE id = v_reg.champ_id;
  v_enabled := coalesce((v_t.beta_lifecycle->>'partner_pay')::boolean, false);
  v_fee := coalesce(public.champ_entry_fee_cents(v_reg.champ_id), 0);

  IF v_reg.partner_member_id IS NOT NULL THEN
    SELECT * INTO v_partner FROM public.club_champs_registrations
     WHERE champ_id = v_reg.champ_id AND club_member_id = v_reg.partner_member_id
       AND partner_member_id = v_reg.club_member_id
       AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn');
  END IF;

  v_me_owes := lower(coalesce(v_reg.status,'')) IN ('pending_payment','pending_eft','invited','payment_failed')
               AND v_reg.fee_settled_via IS NULL AND NOT public.champ_member_fee_paid(v_reg.champ_id, v_reg.club_member_id);
  v_p_owes := v_partner.id IS NOT NULL
              AND lower(coalesce(v_partner.status,'')) IN ('pending_payment','pending_eft','invited','payment_failed')
              AND v_partner.fee_settled_via IS NULL AND NOT public.champ_member_fee_paid(v_reg.champ_id, v_partner.club_member_id);

  IF v_partner.id IS NOT NULL THEN
    SELECT name INTO v_pm FROM public.club_members WHERE id = v_partner.club_member_id;
    v_pname := CASE WHEN v_guest
      THEN split_part(trim(coalesce(v_pm.name,'')), ' ', 1) || coalesce(' ' || nullif(left(regexp_replace(trim(coalesce(v_pm.name,'')), '^\S+\s*', ''), 1), '') || '.', '')
      ELSE coalesce(v_pm.name, 'your partner') END;
  END IF;

  IF p_scope = 'options' THEN
    RETURN jsonb_build_object('ok', true, 'enabled', v_enabled AND v_fee > 0 AND v_partner.id IS NOT NULL,
      'partner_name', v_pname, 'partner_owes', coalesce(v_p_owes,false), 'me_owes', v_me_owes,
      'fee_cents', v_fee);
  END IF;

  IF NOT v_enabled OR v_fee <= 0 OR v_partner.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Paying for your partner is not available for this tournament');
  END IF;
  IF NOT coalesce(v_p_owes,false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Your partner''s entry fee is already settled');
  END IF;
  IF p_scope = 'both' AND NOT v_me_owes THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Your own entry fee is already settled — pay your partner''s fee only');
  END IF;
  IF p_scope NOT IN ('partner','both') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid payment choice');
  END IF;

  RETURN jsonb_build_object('ok', true,
    'club_id', v_me.club_id, 'club_member_id', v_me.id, 'user_id', v_me.user_id,
    -- partner: the partner's own entry is the one settled; both: mine, plus the partner as a cover.
    'registration_id', CASE WHEN p_scope = 'partner' THEN v_partner.id ELSE v_reg.id END,
    'cover_registration_ids', CASE WHEN p_scope = 'both' THEN jsonb_build_array(v_partner.id) ELSE '[]'::jsonb END,
    'payer_member_id', v_me.id,
    'amount', (v_fee * CASE WHEN p_scope = 'both' THEN 2 ELSE 1 END)::numeric / 100,
    'description', coalesce(v_t.name,'Tournament') || CASE WHEN p_scope = 'both' THEN ' entry fees (you and ' || coalesce(v_pname,'partner') || ')' ELSE ' entry fee for ' || coalesce(v_pname,'your partner') END);
END;
$$;
REVOKE ALL ON FUNCTION public.step_pair_payment_context(uuid, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.step_pair_payment_context(uuid, text, text, uuid, text) TO authenticated, service_role;

-- Called by Stitch settlement after a completed partner/both payment. Settles only the
-- partner entries named in the session (still active, still owing), records who paid,
-- and fixes the payer's own entry to one fee (the session amount covered several).
CREATE OR REPLACE FUNCTION public.step_apply_partner_cover(
  p_primary_registration_id uuid, p_cover_ids uuid[], p_payer_member_id uuid, p_payment_ref text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_primary record; v_fee int; r record; v_n int := 0;
BEGIN
  SELECT * INTO v_primary FROM public.club_champs_registrations WHERE id = p_primary_registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  v_fee := coalesce(public.champ_entry_fee_cents(v_primary.champ_id), 0);

  UPDATE public.club_champs_registrations
     SET fee_paid_cents = v_fee,
         paid_by_member_id = CASE WHEN club_member_id <> p_payer_member_id THEN p_payer_member_id ELSE paid_by_member_id END
   WHERE id = p_primary_registration_id;

  FOR r IN SELECT * FROM public.club_champs_registrations
            WHERE id = ANY(coalesce(p_cover_ids,'{}')) AND champ_id = v_primary.champ_id
              AND partner_member_id = p_payer_member_id
              AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn','paid','waived')
              AND fee_settled_via IS NULL
  LOOP
    UPDATE public.club_champs_registrations
       SET status = 'paid', fee_paid_cents = v_fee, paid_at = coalesce(paid_at, now()),
           payment_ref = coalesce(payment_ref, p_payment_ref), paid_by_member_id = p_payer_member_id,
           confirmed_at = coalesce(confirmed_at, now())
     WHERE id = r.id;
    IF r.fee_payment_id IS NOT NULL THEN
      UPDATE public.club_member_fee_payments SET paid = true, paid_at = coalesce(paid_at, now())
       WHERE id = r.fee_payment_id AND paid = false;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'covered', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.step_apply_partner_cover(uuid, uuid[], uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.step_apply_partner_cover(uuid, uuid[], uuid, text) TO service_role;