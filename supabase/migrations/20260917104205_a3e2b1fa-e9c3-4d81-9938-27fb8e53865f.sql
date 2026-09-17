CREATE OR REPLACE FUNCTION public.champ_is_family_doubles(p_champ_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.club_champs c
     WHERE c.id = p_champ_id
       AND lower(COALESCE(c.match_type, '')) = 'doubles'
       AND lower(COALESCE(c.name, '')) LIKE '%family%doubles%'
  );
$$;

CREATE OR REPLACE FUNCTION public.list_family_doubles_players(
  p_champ_id uuid,
  p_group_number integer,
  p_token text DEFAULT NULL,
  p_verify text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payer uuid;
  v_rows jsonb;
BEGIN
  v_payer := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF NOT public.champ_is_family_doubles(p_champ_id) THEN
    RAISE EXCEPTION 'Family pair entry is not enabled for this tournament';
  END IF;
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN
    RAISE EXCEPTION 'This division is not a doubles division';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'member_id', m.id,
           'display_name', m.name,
           'club_id', m.club_id,
           'club_name', c.name,
           'gender', m.gender,
           'ladder_position', m.ladder_position,
           'fee_paid', public.champ_member_fee_paid(p_champ_id, m.id),
           'is_payer', m.id = v_payer,
           'paired', EXISTS (
             SELECT 1 FROM public.champ_doubles_pairs p
              WHERE p.champ_id = p_champ_id
                AND p.group_number = p_group_number
                AND p.status IN ('pending','awaiting_payment','confirmed')
                AND m.id IN (p.member_a, p.member_b)
           )
         ) ORDER BY m.name), '[]'::jsonb)
    INTO v_rows
    FROM public.club_champs_registrations r
    JOIN public.club_members m ON m.id = r.club_member_id
    LEFT JOIN public.clubs c ON c.id = m.club_id
   WHERE r.champ_id = p_champ_id
     AND lower(COALESCE(r.status, '')) NOT IN ('cancelled','declined','withdrawn')
     AND r.declined_at IS NULL
     AND r.invite_revoked_at IS NULL
     AND (p_group_number = ANY (COALESCE(r.division_choices, '{}'))
          OR COALESCE(array_length(r.division_choices, 1), 0) = 0)
     AND (r.invited_at IS NOT NULL OR r.confirmed_at IS NOT NULL);

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_family_doubles_pair(
  p_champ_id uuid,
  p_group_number integer,
  p_member_a uuid,
  p_member_b uuid,
  p_token text DEFAULT NULL,
  p_verify text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payer uuid;
  v_id uuid;
  v_status text;
BEGIN
  v_payer := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF NOT public.champ_is_family_doubles(p_champ_id) THEN
    RAISE EXCEPTION 'Family pair entry is not enabled for this tournament';
  END IF;
  IF p_member_a = p_member_b THEN RAISE EXCEPTION 'Pick two different players'; END IF;
  IF public.champ_pairing_locked(p_champ_id) THEN RAISE EXCEPTION 'Doubles pairs are locked by the organiser'; END IF;
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN
    RAISE EXCEPTION 'This division is not a doubles division';
  END IF;
  IF NOT public.champ_member_invited(p_champ_id, p_member_a, p_group_number)
     OR NOT public.champ_member_invited(p_champ_id, p_member_b, p_group_number) THEN
    RAISE EXCEPTION 'Both players must be invited to this Family Doubles division';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_champ_id::text || ':' || p_group_number::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.champ_doubles_pairs p
     WHERE p.champ_id = p_champ_id
       AND p.group_number = p_group_number
       AND p.status IN ('pending','awaiting_payment','confirmed')
       AND (p.member_a IN (p_member_a, p_member_b) OR p.member_b IN (p_member_a, p_member_b))
  ) THEN
    RAISE EXCEPTION 'One of these players is already paired in this division';
  END IF;

  UPDATE public.club_champs_registrations
     SET confirmed_at = COALESCE(confirmed_at, now()),
         division_choices = CASE
           WHEN p_group_number = ANY (COALESCE(division_choices, '{}')) THEN division_choices
           ELSE array_append(COALESCE(division_choices, '{}'), p_group_number)
         END,
         status = CASE
           WHEN COALESCE(public.champ_entry_fee_cents(p_champ_id), 0) > 0 THEN 'pending_payment'
           ELSE status
         END
   WHERE champ_id = p_champ_id
     AND club_member_id IN (p_member_a, p_member_b)
     AND lower(COALESCE(status, '')) NOT IN ('cancelled','declined','withdrawn');

  INSERT INTO public.champ_doubles_pairs (
    champ_id, group_number, member_a, member_b, proposed_by, status,
    responded_at, responded_by, accepted_at, pays_for_partner, payer_member_id, origin
  ) VALUES (
    p_champ_id, p_group_number, p_member_a, p_member_b, v_payer, 'awaiting_payment',
    now(), v_payer, now(), true, v_payer, 'family'
  ) RETURNING id INTO v_id;

  v_status := public.champ_pair_settle(v_id);
  RETURN jsonb_build_object('id', v_id, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_doubles_pairing_state(p_champ_id uuid, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  SELECT count(DISTINCT member_id)::int INTO v_due_count
    FROM (
      SELECT v_me AS member_id
      UNION ALL
      SELECT p.member_a FROM public.champ_doubles_pairs p
       WHERE p.champ_id = p_champ_id AND COALESCE(p.payer_member_id, p.proposed_by) = v_me
         AND p.pays_for_partner AND p.status IN ('pending','awaiting_payment','confirmed')
      UNION ALL
      SELECT p.member_b FROM public.champ_doubles_pairs p
       WHERE p.champ_id = p_champ_id AND COALESCE(p.payer_member_id, p.proposed_by) = v_me
         AND p.pays_for_partner AND p.status IN ('pending','awaiting_payment','confirmed')
    ) covered
   WHERE NOT public.champ_member_fee_paid(p_champ_id, covered.member_id);

  RETURN jsonb_build_object(
    'member_id', v_me,
    'locked', public.champ_pairing_locked(p_champ_id),
    'family_mode', v_family,
    'entry_fee_cents', v_fee,
    'my_fee_paid', public.champ_member_fee_paid(p_champ_id, v_me),
    'amount_due_cents', v_fee * COALESCE(v_due_count, 0),
    'pairs', v_rows,
    'managed_pairs', v_managed_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tournament_invite_payment_context(p_token text, p_verify text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reg record;
  v_champ record;
  v_member record;
  v_fee integer;
  v_due_count integer;
  v_amount numeric;
  v_covered jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid');
  END IF;

  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND OR v_reg.invite_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid');
  END IF;

  SELECT id, club_id, name, email, phone, user_id INTO v_member
    FROM public.club_members WHERE id = v_reg.club_member_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid'); END IF;

  IF NOT (auth.uid() IS NOT NULL AND v_member.user_id IS NOT NULL AND auth.uid() = v_member.user_id) THEN
    IF NOT public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
      RETURN jsonb_build_object('ok', false, 'needs_verification', true,
        'error', 'We could not verify that this invitation is yours. Please check the detail you entered.');
    END IF;
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid'); END IF;

  v_fee := COALESCE(public.champ_entry_fee_cents(v_reg.champ_id), 0);
  IF v_fee <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'This tournament has no entry fee to pay'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.champ_doubles_pairs p
     WHERE p.champ_id = v_reg.champ_id
       AND p.status IN ('pending','awaiting_payment','confirmed')
       AND p.pays_for_partner
       AND COALESCE(p.payer_member_id, p.proposed_by) <> v_reg.club_member_id
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
       WHERE p.champ_id = v_reg.champ_id
         AND p.pays_for_partner
         AND COALESCE(p.payer_member_id, p.proposed_by) = v_reg.club_member_id
         AND p.status IN ('pending','awaiting_payment','confirmed')
      UNION ALL
      SELECT p.member_b FROM public.champ_doubles_pairs p
       WHERE p.champ_id = v_reg.champ_id
         AND p.pays_for_partner
         AND COALESCE(p.payer_member_id, p.proposed_by) = v_reg.club_member_id
         AND p.status IN ('pending','awaiting_payment','confirmed')
    ) covered
   WHERE NOT public.champ_member_fee_paid(v_reg.champ_id, covered.member_id);

  IF COALESCE(v_due_count, 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'There is nothing outstanding on this entry');
  END IF;

  v_amount := (v_fee * v_due_count)::numeric / 100;
  RETURN jsonb_build_object(
    'ok', true,
    'club_id', v_member.club_id,
    'club_member_id', v_member.id,
    'registration_id', v_reg.id,
    'champ_id', v_reg.champ_id,
    'user_id', v_member.user_id,
    'amount', v_amount,
    'fee_payment_id', v_reg.fee_payment_id,
    'covered_member_ids', v_covered,
    'covered_entries', v_due_count,
    'description', COALESCE(v_champ.name, 'Tournament') || ' entry fees (' || v_due_count || ' players)'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.champ_apply_paid_registration(p_registration_id uuid, p_payment_ref text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reg record;
  v_fee int;
  v_member uuid;
  v_pair record;
  v_covered int := 0;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  v_fee := COALESCE(public.champ_entry_fee_cents(v_reg.champ_id), 0);

  FOR v_member IN
    SELECT DISTINCT member_id FROM (
      SELECT p.member_a AS member_id
        FROM public.champ_doubles_pairs p
       WHERE p.champ_id = v_reg.champ_id AND p.pays_for_partner
         AND COALESCE(p.payer_member_id, p.proposed_by) = v_reg.club_member_id
         AND p.status IN ('pending','awaiting_payment','confirmed')
      UNION
      SELECT p.member_b AS member_id
        FROM public.champ_doubles_pairs p
       WHERE p.champ_id = v_reg.champ_id AND p.pays_for_partner
         AND COALESCE(p.payer_member_id, p.proposed_by) = v_reg.club_member_id
         AND p.status IN ('pending','awaiting_payment','confirmed')
    ) covered
    WHERE member_id <> v_reg.club_member_id
  LOOP
    IF NOT public.champ_member_fee_paid(v_reg.champ_id, v_member) THEN
      UPDATE public.club_champs_registrations
         SET status = 'paid',
             fee_paid_cents = GREATEST(COALESCE(fee_paid_cents, 0), v_fee),
             paid_at = COALESCE(paid_at, now()),
             payment_ref = COALESCE(payment_ref, p_payment_ref),
             paid_by_member_id = v_reg.club_member_id,
             confirmed_at = COALESCE(confirmed_at, now())
       WHERE champ_id = v_reg.champ_id AND club_member_id = v_member
         AND lower(COALESCE(status, '')) NOT IN ('cancelled','declined','withdrawn');

      UPDATE public.club_member_fee_payments fp
         SET paid = true, paid_at = COALESCE(fp.paid_at, now())
        FROM public.club_champs_registrations r
       WHERE r.champ_id = v_reg.champ_id AND r.club_member_id = v_member
         AND r.fee_payment_id = fp.id;
      v_covered := v_covered + 1;
    END IF;
  END LOOP;

  FOR v_pair IN
    SELECT id FROM public.champ_doubles_pairs p
     WHERE p.champ_id = v_reg.champ_id
       AND COALESCE(p.payer_member_id, p.proposed_by) = v_reg.club_member_id
       AND p.status IN ('pending','awaiting_payment')
  LOOP
    PERFORM public.champ_pair_settle(v_pair.id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'covered_partners', v_covered);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_doubles_pair(p_pair_id uuid, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_pair record; v_me uuid;
BEGIN
  SELECT * INTO v_pair FROM public.champ_doubles_pairs WHERE id = p_pair_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'This pairing no longer exists'; END IF;
  v_me := public.champ_actor_member(v_pair.champ_id, p_token, p_verify);
  IF v_me NOT IN (v_pair.member_a, v_pair.member_b) AND v_me IS DISTINCT FROM v_pair.payer_member_id THEN
    RAISE EXCEPTION 'This pairing is not yours';
  END IF;
  IF v_pair.status NOT IN ('pending','awaiting_payment','confirmed') THEN
    RETURN jsonb_build_object('id', v_pair.id, 'status', v_pair.status, 'already', true);
  END IF;
  IF public.champ_pairing_locked(v_pair.champ_id) THEN
    RAISE EXCEPTION 'Doubles pairs are locked by the organiser — ask them to reopen pairing';
  END IF;

  UPDATE public.champ_doubles_pairs
     SET status = 'cancelled', responded_at = now(), responded_by = v_me
   WHERE id = v_pair.id;

  IF v_pair.status = 'confirmed' THEN
    UPDATE public.club_champs_entries SET partner_member_id = NULL
     WHERE champ_id = v_pair.champ_id AND group_number = v_pair.group_number
       AND club_member_id IN (v_pair.member_a, v_pair.member_b);
  END IF;
  RETURN jsonb_build_object('id', v_pair.id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.champ_is_family_doubles(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_family_doubles_players(uuid,integer,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_family_doubles_pair(uuid,integer,uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tournament_invite_payment_context(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.champ_is_family_doubles(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_family_doubles_players(uuid,integer,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_family_doubles_pair(uuid,integer,uuid,uuid,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tournament_invite_payment_context(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_doubles_pairing_state(uuid,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_doubles_pair(uuid,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.champ_apply_paid_registration(uuid,text) TO service_role;