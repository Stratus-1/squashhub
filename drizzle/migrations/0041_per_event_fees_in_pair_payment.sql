CREATE OR REPLACE FUNCTION public.champ_division_fee_cents(p_champ_id uuid, p_group int)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN coalesce(public.champ_entry_fee_cents(p_champ_id),0) <= 0 THEN 0
    ELSE coalesce((SELECT (t.division_fees ->> p_group::text)::int FROM public.tournaments t
                    WHERE t.id = p_champ_id AND t.division_fees IS NOT NULL AND t.division_fees <> 'null'::jsonb),
                  public.champ_entry_fee_cents(p_champ_id)) END;
$function$;

CREATE OR REPLACE FUNCTION public.get_doubles_pairing_state(p_champ_id uuid, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid;
  v_rows jsonb;
  v_managed_rows jsonb;
  v_fee int;
  v_family boolean;
  v_due_count int;
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  v_fee := COALESCE(public.champ_entry_fee_cents(p_champ_id), 0);
  v_family := public.champ_is_family_doubles(p_champ_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'group_number', p.group_number,
           'status', p.status,
           'origin', p.origin,
           'proposed_by_me', p.proposed_by = v_me,
           'partner_member_id', CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END,
           'partner_name', pm.name,
           'partner_club', pc.name,
           'pays_for_partner', p.pays_for_partner,
           'payer_is_me', p.payer_member_id = v_me,
           'fee_cents', public.champ_division_fee_cents(p_champ_id, p.group_number),
           'covered_by_partner', p.pays_for_partner AND p.payer_member_id IS DISTINCT FROM v_me,
           'my_fee_paid', public.champ_member_fee_paid(p_champ_id, v_me),
           'partner_fee_paid', public.champ_member_fee_paid(p_champ_id, CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END),
           'locked_at', p.locked_at,
           'created_at', p.created_at,
           'responded_at', p.responded_at
         ) ORDER BY p.group_number, p.created_at), '[]'::jsonb)
    INTO v_rows
    FROM public.champ_doubles_pairs p
    JOIN public.club_members pm ON pm.id = CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END
    LEFT JOIN public.clubs pc ON pc.id = pm.club_id
   WHERE p.champ_id = p_champ_id
     AND v_me IN (p.member_a, p.member_b)
     AND p.status IN ('pending','awaiting_payment','confirmed');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'group_number', p.group_number,
           'status', p.status,
           'member_a', p.member_a,
           'member_a_name', a.name,
           'member_b', p.member_b,
           'member_b_name', b.name,
           'member_a_paid', public.champ_member_fee_paid(p.champ_id, p.member_a),
           'member_b_paid', public.champ_member_fee_paid(p.champ_id, p.member_b),
           'locked_at', p.locked_at,
           'created_at', p.created_at
         ) ORDER BY p.group_number, p.created_at), '[]'::jsonb)
    INTO v_managed_rows
    FROM public.champ_doubles_pairs p
    JOIN public.club_members a ON a.id = p.member_a
    JOIN public.club_members b ON b.id = p.member_b
   WHERE p.champ_id = p_champ_id
     AND COALESCE(p.payer_member_id, p.proposed_by) = v_me
     AND p.status IN ('pending','awaiting_payment','confirmed');

  SELECT COALESCE((SELECT public.champ_reg_own_due_cents(r.id)
                      FROM public.club_champs_registrations r
                     WHERE r.champ_id = p_champ_id AND r.club_member_id = v_me
                       AND lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn')
                       AND NOT public.champ_member_fee_settled(p_champ_id, v_me)
                     LIMIT 1), 0)
       + COALESCE((SELECT sum(public.champ_division_fee_cents(p_champ_id, p.group_number))
                      FROM public.champ_doubles_pairs p
                     WHERE p.champ_id = p_champ_id AND COALESCE(p.payer_member_id, p.proposed_by) = v_me
                       AND p.pays_for_partner AND p.member_a <> p.member_b
                       AND p.status IN ('pending','awaiting_payment','confirmed')
                       AND NOT public.champ_member_event_paid(p_champ_id,
                             CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END, p.group_number)), 0)
    INTO v_due_count;

  RETURN jsonb_build_object(
    'member_id', v_me,
    'locked', public.champ_pairing_locked(p_champ_id),
    'family_mode', v_family,
    'entry_fee_cents', v_fee,
    'my_fee_paid', public.champ_member_fee_paid(p_champ_id, v_me),
    'amount_due_cents', COALESCE(v_due_count, 0),
    'pairs', v_rows,
    'managed_pairs', v_managed_rows
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tournament_invite_payment_context(p_token text, p_verify text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record; v_champ record; v_member record; v_fee integer; v_own integer := 0; v_own_events int := 0;
  v_pairs int := 0; v_pair_cents int := 0; v_amount numeric; v_covered jsonb; v_actor uuid;
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
  v_actor := coalesce(auth.uid(), p_user_id);
  IF NOT (v_actor IS NOT NULL AND v_member.user_id IS NOT NULL AND v_actor = v_member.user_id) THEN
    IF NOT public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
      RETURN jsonb_build_object('ok', false, 'needs_verification', true,
        'error', 'We could not verify that this invitation is yours. Please check the detail you entered.');
    END IF;
  END IF;
  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid'); END IF;
  IF v_reg.fee_settled_via = 'account' THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'This entry fee is already charged to the member account — settle it from My Account');
  END IF;
  IF lower(coalesce(v_reg.fee_status,'')) IN ('paid','waived') THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'This entry fee is already paid');
  END IF;
  v_fee := coalesce(public.champ_entry_fee_cents(v_reg.champ_id), 0);
  IF v_fee <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'This tournament has no entry fee to pay'); END IF;

  IF NOT public.champ_member_fee_settled(v_reg.champ_id, v_reg.club_member_id) THEN
    v_own_events := public.champ_reg_own_events(v_reg.id);
    v_own := coalesce(public.champ_reg_own_due_cents(v_reg.id), 0);
  END IF;

  SELECT count(*)::int, coalesce(sum(public.champ_division_fee_cents(v_reg.champ_id, p.group_number)),0)::int,
         coalesce(jsonb_agg(DISTINCT CASE WHEN p.member_a = v_reg.club_member_id THEN p.member_b ELSE p.member_a END), '[]'::jsonb)
    INTO v_pairs, v_pair_cents, v_covered
    FROM public.champ_doubles_pairs p
   WHERE p.champ_id = v_reg.champ_id AND p.pays_for_partner
     AND coalesce(p.payer_member_id, p.proposed_by) = v_reg.club_member_id
     AND p.status IN ('pending','awaiting_payment','confirmed')
     AND p.member_a <> p.member_b
     AND NOT public.champ_member_event_paid(v_reg.champ_id, CASE WHEN p.member_a = v_reg.club_member_id THEN p.member_b ELSE p.member_a END, p.group_number);

  IF v_own_events = 0 AND coalesce(v_pairs,0) = 0 THEN
    IF EXISTS (SELECT 1 FROM public.champ_doubles_pairs p
                WHERE p.champ_id = v_reg.champ_id AND p.status IN ('pending','awaiting_payment','confirmed')
                  AND p.pays_for_partner AND coalesce(p.payer_member_id, p.proposed_by) <> v_reg.club_member_id
                  AND v_reg.club_member_id IN (p.member_a, p.member_b)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Your partner is paying your entry fee for this event');
    END IF;
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'There is nothing outstanding on this entry');
  END IF;

  v_amount := (v_own + coalesce(v_pair_cents,0))::numeric / 100;
  RETURN jsonb_build_object(
    'ok', true, 'club_id', v_member.club_id, 'club_member_id', v_member.id, 'registration_id', v_reg.id,
    'champ_id', v_reg.champ_id, 'user_id', v_member.user_id, 'amount', v_amount,
    'fee_payment_id', v_reg.fee_payment_id, 'covered_member_ids', v_covered,
    'covered_entries', v_own_events + coalesce(v_pairs,0), 'own_events', v_own_events, 'partner_events', coalesce(v_pairs,0),
    'event_fee_cents', v_fee,
    'description', coalesce(v_champ.name, 'Tournament') || ' entry fees (' || (v_own_events + coalesce(v_pairs,0)) || ' event'
                   || CASE WHEN v_own_events + coalesce(v_pairs,0) = 1 THEN '' ELSE 's' END || ')'
  );
END $function$;