CREATE OR REPLACE FUNCTION public.step_pair_payment_context(p_registration_id uuid, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_scope text DEFAULT 'options'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record; v_partner record; v_me record; v_pm record; v_t record; v_c record;
  v_actor uuid; v_fee int; v_me_owes boolean; v_p_owes boolean; v_enabled boolean; v_guest boolean := false;
  v_verified boolean := true; v_pname text; v_account boolean; v_group int; v_my_due int := 0; v_cover int;
  v_pair_group int;
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

  SELECT * INTO v_partner FROM public.club_champs_registrations WHERE false;
  IF v_reg.partner_member_id IS NOT NULL THEN
    SELECT * INTO v_partner FROM public.club_champs_registrations
     WHERE champ_id = v_reg.champ_id AND club_member_id = v_reg.partner_member_id
       AND partner_member_id = v_reg.club_member_id
       AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn');
  END IF;
  -- Pairs chosen through the doubles partner picker live in champ_doubles_pairs only.
  IF v_partner.id IS NULL THEN
    SELECT d.group_number INTO v_pair_group
      FROM public.champ_doubles_pairs d
     WHERE d.champ_id = v_reg.champ_id AND v_reg.club_member_id IN (d.member_a, d.member_b)
       AND lower(coalesce(d.status,'')) NOT IN ('declined','cancelled','withdrawn','dissolved')
     ORDER BY d.updated_at DESC LIMIT 1;
    IF v_pair_group IS NOT NULL THEN
      SELECT p.* INTO v_partner
        FROM public.champ_doubles_pairs d
        JOIN public.club_champs_registrations p ON p.champ_id = d.champ_id
         AND p.club_member_id = CASE WHEN d.member_a = v_reg.club_member_id THEN d.member_b ELSE d.member_a END
         AND lower(coalesce(p.status,'')) NOT IN ('cancelled','declined','withdrawn')
       WHERE d.champ_id = v_reg.champ_id AND d.group_number = v_pair_group
         AND v_reg.club_member_id IN (d.member_a, d.member_b)
       LIMIT 1;
    END IF;
  END IF;

  v_me_owes := lower(coalesce(v_reg.status,'')) NOT IN ('cancelled','declined','withdrawn')
               AND NOT public.champ_member_fee_settled(v_reg.champ_id, v_reg.club_member_id);
  IF v_me_owes THEN v_my_due := coalesce(public.champ_reg_own_due_cents(v_reg.id), 0); END IF;
  IF v_partner.id IS NOT NULL THEN
    v_group := coalesce(v_pair_group, public.champ_shared_group(v_partner.id, v_reg.club_member_id));
    v_cover := public.champ_partner_cover_cents(v_reg.champ_id, v_partner.club_member_id, v_group);
    v_p_owes := NOT public.champ_member_event_paid(v_reg.champ_id, v_partner.club_member_id, v_group);
    SELECT name INTO v_pm FROM public.club_members WHERE id = v_partner.club_member_id;
    v_pname := CASE WHEN v_guest
      THEN split_part(trim(coalesce(v_pm.name,'')), ' ', 1) || coalesce(' ' || nullif(left(regexp_replace(trim(coalesce(v_pm.name,'')), '^\S+\s*', ''), 1), '') || '.', '')
      ELSE coalesce(v_pm.name, 'your partner') END;
  END IF;

  IF p_scope = 'options' THEN
    RETURN jsonb_build_object('ok', true, 'enabled', v_enabled AND v_fee > 0 AND v_partner.id IS NOT NULL,
      'partner_name', v_pname, 'partner_owes', coalesce(v_p_owes,false), 'me_owes', v_me_owes,
      'fee_cents', coalesce(v_cover, v_fee), 'my_due_cents', v_my_due, 'partner_group', v_group,
      'account_allowed', v_account, 'needs_verification', NOT v_verified,
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
    'my_registration_id', v_reg.id, 'partner_registration_id', v_partner.id, 'partner_group', v_group,
    'registration_id', CASE WHEN p_scope = 'partner' THEN v_partner.id ELSE v_reg.id END,
    'cover_registration_ids', CASE WHEN p_scope = 'both' THEN jsonb_build_array(v_partner.id) ELSE '[]'::jsonb END,
    'payer_member_id', v_me.id, 'account_allowed', v_account, 'partner_name', v_pname,
    'amount', (coalesce(v_cover, v_fee) + CASE WHEN p_scope = 'both' THEN v_my_due ELSE 0 END)::numeric / 100,
    'description', coalesce(v_t.name,'Tournament') || CASE WHEN p_scope = 'both' THEN ' entry fees (you and ' || coalesce(v_pname,'partner') || ')' ELSE ' entry fee for ' || coalesce(v_pname,'your partner') || ' (one event)' END);
END $function$;