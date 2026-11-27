CREATE OR REPLACE FUNCTION public.set_doubles_pair_payer(p_champ_id uuid, p_group_number integer, p_mode text, p_token text DEFAULT NULL, p_verify text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_me uuid; p record; v_partner uuid; v_club uuid;
BEGIN
  IF p_mode NOT IN ('self','both') THEN RAISE EXCEPTION 'Choose who pays'; END IF;
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF v_me IS NULL THEN RAISE EXCEPTION 'Please verify this invitation first'; END IF;
  IF public.champ_pairing_locked(p_champ_id) THEN RAISE EXCEPTION 'Doubles pairs are locked by the organiser'; END IF;
  SELECT * INTO p FROM public.champ_doubles_pairs
   WHERE champ_id = p_champ_id AND group_number = p_group_number
     AND status IN ('pending','awaiting_payment') AND v_me IN (member_a, member_b)
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No unpaid pair found for this category'; END IF;
  v_partner := CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END;
  IF public.champ_member_event_paid(p_champ_id, v_partner, p_group_number) AND p_mode = 'both' THEN
    RAISE EXCEPTION 'Your partner has already paid for this category';
  END IF;
  IF p.covered_by_partner_paid_guard IS NOT NULL THEN NULL; END IF;
  UPDATE public.champ_doubles_pairs
     SET pays_for_partner = (p_mode = 'both'),
         payer_member_id = CASE WHEN p_mode = 'both' THEN v_me ELSE NULL END,
         updated_at = now()
   WHERE id = p.id;
  SELECT club_id INTO v_club FROM public.tournaments WHERE id = p_champ_id;
  INSERT INTO public.audit_events (club_id, actor_user_id, entity_type, entity_id, action, reason, before_data, after_data)
  VALUES (v_club, auth.uid(), 'champ_doubles_pair', p.id, 'doubles_payer_changed',
          CASE WHEN p_mode='both' THEN 'Player chose to pay both entries' ELSE 'Player chose to pay own entry only' END,
          jsonb_build_object('payer_member_id', p.payer_member_id, 'pays_for_partner', p.pays_for_partner),
          jsonb_build_object('payer_member_id', CASE WHEN p_mode='both' THEN v_me END, 'pays_for_partner', p_mode='both', 'by_member', v_me));
  RETURN jsonb_build_object('ok', true, 'pair_id', p.id, 'mode', p_mode);
END $$;
REVOKE ALL ON FUNCTION public.set_doubles_pair_payer(uuid,integer,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_doubles_pair_payer(uuid,integer,text,text,text) TO anon, authenticated, service_role;