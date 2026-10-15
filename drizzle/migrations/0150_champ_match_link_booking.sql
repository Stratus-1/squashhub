CREATE OR REPLACE FUNCTION public.link_booking_to_champ_match(p_match_id uuid, p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; b record; v_club uuid; v_uid uuid := auth.uid(); v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  SELECT cm.*, t.club_id AS t_club INTO m FROM club_champs_matches cm JOIN tournaments t ON t.id = cm.champ_id WHERE cm.id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fixture not found'; END IF;
  v_club := m.t_club;
  SELECT * INTO b FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND OR b.club_id IS DISTINCT FROM v_club THEN RAISE EXCEPTION 'Booking not found at this club'; END IF;
  IF coalesce(b.status,'active') <> 'active' THEN RAISE EXCEPTION 'Booking is not active'; END IF;
  v_ok := public.is_club_admin(v_uid, v_club) OR EXISTS (
    SELECT 1 FROM club_members cmem WHERE cmem.user_id = v_uid AND cmem.club_id = v_club
      AND cmem.id IN (m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id));
  IF NOT v_ok THEN RAISE EXCEPTION 'Only a player in this fixture or a club admin can link it' USING ERRCODE='42501'; END IF;
  IF coalesce(m.is_bye,false) OR coalesce(m.status,'') IN ('completed','forfeited','walkover','cancelled') THEN RAISE EXCEPTION 'Fixture is already decided'; END IF;
  IF m.booking_id IS NOT NULL AND m.booking_id <> p_booking_id THEN RAISE EXCEPTION 'Fixture is already linked to another booking'; END IF;
  IF EXISTS (SELECT 1 FROM club_champs_matches WHERE booking_id = p_booking_id AND id <> p_match_id) THEN RAISE EXCEPTION 'Booking is already linked to another fixture'; END IF;
  PERFORM set_config('app.self_schedule','1',true);
  UPDATE club_champs_matches SET booking_id = p_booking_id, scheduled_date = b.date, scheduled_time = b.start_time, court_id = b.court_id, updated_at = now() WHERE id = p_match_id;
  PERFORM set_config('app.self_schedule','',true);
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.unlink_booking_from_champ_match(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  SELECT cm.*, t.club_id AS t_club INTO m FROM club_champs_matches cm JOIN tournaments t ON t.id = cm.champ_id WHERE cm.id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fixture not found'; END IF;
  IF NOT (public.is_club_admin(v_uid, m.t_club) OR EXISTS (SELECT 1 FROM club_members c WHERE c.user_id = v_uid AND c.club_id = m.t_club
      AND c.id IN (m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id))) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  IF coalesce(m.status,'') IN ('completed','forfeited','walkover','cancelled') THEN RAISE EXCEPTION 'Fixture is already decided'; END IF;
  PERFORM set_config('app.self_schedule','1',true);
  UPDATE club_champs_matches SET booking_id = NULL, scheduled_date = NULL, scheduled_time = NULL, court_id = NULL, updated_at = now() WHERE id = p_match_id AND booking_id IS NOT NULL;
  PERFORM set_config('app.self_schedule','',true);
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.link_booking_to_champ_match(uuid,uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.unlink_booking_from_champ_match(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.link_booking_to_champ_match(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_booking_from_champ_match(uuid) TO authenticated;