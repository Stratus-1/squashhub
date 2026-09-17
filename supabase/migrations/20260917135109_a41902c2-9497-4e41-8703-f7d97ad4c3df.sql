CREATE OR REPLACE FUNCTION public.tournament_invite_payment_context(p_token text, p_verify text DEFAULT NULL, p_user_id uuid DEFAULT NULL)
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
  v_actor uuid;
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

  -- The actor is either the signed-in caller (direct RPC) or, when the request
  -- comes through the payment edge function, the verified auth user it passes in.
  v_actor := COALESCE(auth.uid(), p_user_id);

  IF NOT (v_actor IS NOT NULL AND v_member.user_id IS NOT NULL AND v_actor = v_member.user_id) THEN
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

REVOKE ALL ON FUNCTION public.tournament_invite_payment_context(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_invite_payment_context(text,text,uuid) TO service_role;