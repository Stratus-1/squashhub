CREATE OR REPLACE FUNCTION public.tournament_invite_payment_context(p_token text, p_verify text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg record;
  v_champ record;
  v_member record;
  v_amount numeric;
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
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid');
  END IF;

  IF NOT (auth.uid() IS NOT NULL AND v_member.user_id IS NOT NULL AND auth.uid() = v_member.user_id) THEN
    IF NOT public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
      RETURN jsonb_build_object('ok', false, 'needs_verification', true,
        'error', 'We could not verify that this invitation is yours. Please check the detail you entered.');
    END IF;
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid');
  END IF;

  IF lower(COALESCE(v_reg.status, '')) IN ('paid','waived','cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'There is nothing outstanding on this entry');
  END IF;

  v_amount := COALESCE(v_champ.entry_fee_cents, 0)::numeric / 100;
  IF NOT COALESCE(v_champ.payment_required, false) OR v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This tournament has no entry fee to pay');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'club_id', v_member.club_id,
    'club_member_id', v_member.id,
    'registration_id', v_reg.id,
    'champ_id', v_reg.champ_id,
    'user_id', v_member.user_id,
    'amount', v_amount,
    'fee_payment_id', v_reg.fee_payment_id,
    'description', COALESCE(v_champ.name, 'Tournament') || ' entry fee'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_invite_payment_context(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_invite_payment_context(text, text) TO service_role;