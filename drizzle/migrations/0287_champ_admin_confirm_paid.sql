CREATE OR REPLACE FUNCTION public.champ_admin_confirm_paid(p_club_id uuid, p_champ_id uuid, p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg public.club_champs_registrations%ROWTYPE;
  v_fee_member uuid;
  v_fee_club uuid;
  v_cents integer;
  v_now timestamptz := now();
  v_before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in to confirm payment'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = p_champ_id AND club_id = p_club_id) THEN
    RAISE EXCEPTION 'Tournament not found for this club';
  END IF;
  IF NOT (public.is_club_admin_or_permitted(auth.uid(), p_club_id, 'champs')
       OR public.is_club_admin_or_permitted(auth.uid(), p_club_id, 'fees')
       OR public.is_club_admin_or_permitted(auth.uid(), p_club_id, 'finance')) THEN
    RAISE EXCEPTION 'Only club tournament or finance administrators can confirm payment';
  END IF;
  SELECT * INTO v_reg FROM public.club_champs_registrations
   WHERE id = p_registration_id AND champ_id = p_champ_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found for this tournament'; END IF;
  IF lower(coalesce(v_reg.status,'')) IN ('cancelled','declined','withdrawn')
     OR v_reg.registration_status = 'declined' THEN
    RAISE EXCEPTION 'This registration is not available for payment updates';
  END IF;
  IF v_reg.fee_status IN ('paid','waived','not_required') THEN
    RETURN jsonb_build_object('ok', true, 'id', v_reg.id, 'already_settled', true);
  END IF;
  v_before := jsonb_build_object('status', v_reg.status, 'fee_status', v_reg.fee_status, 'fee_payment_id', v_reg.fee_payment_id);
  v_cents := public.champ_reg_own_due_cents(v_reg.id);
  IF coalesce(v_cents,0) <= 0 THEN RAISE EXCEPTION 'There is no entry fee to confirm'; END IF;
  IF v_reg.fee_payment_id IS NOT NULL THEN
    SELECT club_member_id INTO v_fee_member FROM public.club_member_fee_payments
     WHERE id = v_reg.fee_payment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The linked entry fee could not be found'; END IF;
    SELECT club_id INTO v_fee_club FROM public.club_members WHERE id = v_fee_member;
    IF v_fee_club IS DISTINCT FROM p_club_id THEN RAISE EXCEPTION 'The linked entry fee belongs to another club'; END IF;
    UPDATE public.club_member_fee_payments SET paid = true, paid_at = v_now
     WHERE id = v_reg.fee_payment_id AND NOT coalesce(paid,false);
  END IF;
  UPDATE public.club_champs_registrations
     SET status = 'paid', fee_paid_cents = v_cents, paid_at = v_now,
         payment_ref = 'ADMIN-' || gen_random_uuid()::text
   WHERE id = v_reg.id AND champ_id = p_champ_id;
  INSERT INTO public.audit_events(club_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  VALUES(p_club_id, auth.uid(), 'tournament_registration', v_reg.id, 'admin_confirm_paid', v_before,
         jsonb_build_object('status','paid','fee_paid_cents',v_cents,'fee_payment_id',v_reg.fee_payment_id));
  RETURN jsonb_build_object('ok',true,'id',v_reg.id);
END;
$$;
REVOKE ALL ON FUNCTION public.champ_admin_confirm_paid(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.champ_admin_confirm_paid(uuid, uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.champ_admin_confirm_paid(uuid, uuid, uuid) IS 'Atomic club-scoped organiser or finance confirmation; settles only the existing fee, never raises a replacement charge.';