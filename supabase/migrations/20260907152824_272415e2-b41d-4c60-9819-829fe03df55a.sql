CREATE OR REPLACE FUNCTION public.admin_replace_champ_player(
  p_match_id uuid,
  p_slot text,
  p_new_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.club_champs_matches%ROWTYPE;
  v_club_id uuid;
  v_old_member_id uuid;
  v_old_name text;
  v_new_name text;
  v_new_club uuid;
  v_label text;
  v_notify uuid[];
  v_id uuid;
BEGIN
  IF p_slot NOT IN ('player_a','player_b','partner_a','partner_b') THEN
    RAISE EXCEPTION 'Invalid slot';
  END IF;

  SELECT * INTO m FROM public.club_champs_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  SELECT club_id INTO v_club_id FROM public.tournaments WHERE id = m.champ_id;
  IF v_club_id IS NULL THEN RAISE EXCEPTION 'Tournament not found'; END IF;

  IF NOT (public.is_platform_admin(auth.uid())
          OR public.is_club_admin_or_permitted(auth.uid(), v_club_id, 'champs')
          OR public.can_manage_tournament(m.champ_id)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF COALESCE(m.is_bye, false) THEN RAISE EXCEPTION 'This is a bye'; END IF;
  IF m.status = 'completed' OR m.winner_member_id IS NOT NULL THEN
    RAISE EXCEPTION 'This match has already been played';
  END IF;
  IF COALESCE(m.side_a_points,0) > 0 OR COALESCE(m.side_b_points,0) > 0
     OR COALESCE(m.game_scores,'') <> '' OR COALESCE(m.score,'') <> '' THEN
    RAISE EXCEPTION 'This match has already started — use the score correction instead';
  END IF;

  v_old_member_id := CASE p_slot
    WHEN 'player_a' THEN m.player_a_member_id
    WHEN 'player_b' THEN m.player_b_member_id
    WHEN 'partner_a' THEN m.partner_a_member_id
    ELSE m.partner_b_member_id END;

  IF p_new_member_id IS NULL THEN RAISE EXCEPTION 'Pick a replacement player'; END IF;
  IF p_new_member_id = v_old_member_id THEN RAISE EXCEPTION 'That player is already in this slot'; END IF;
  IF p_new_member_id IN (m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id) THEN
    RAISE EXCEPTION 'That player is already in this match';
  END IF;

  SELECT club_id, name INTO v_new_club, v_new_name FROM public.club_members WHERE id = p_new_member_id;
  IF v_new_club IS NULL THEN RAISE EXCEPTION 'Player not found'; END IF;

  SELECT name INTO v_old_name FROM public.club_members WHERE id = v_old_member_id;

  UPDATE public.club_champs_matches SET
    player_a_member_id  = CASE WHEN p_slot = 'player_a'  THEN p_new_member_id ELSE player_a_member_id END,
    player_b_member_id  = CASE WHEN p_slot = 'player_b'  THEN p_new_member_id ELSE player_b_member_id END,
    partner_a_member_id = CASE WHEN p_slot = 'partner_a' THEN p_new_member_id ELSE partner_a_member_id END,
    partner_b_member_id = CASE WHEN p_slot = 'partner_b' THEN p_new_member_id ELSE partner_b_member_id END,
    updated_at = now()
  WHERE id = p_match_id;

  INSERT INTO public.audit_events (club_id, actor_user_id, entity_type, entity_id, action, reason, before_data, after_data)
  VALUES (
    v_club_id, auth.uid(), 'club_champs_match', p_match_id, 'replace_player',
    'Organiser corrected a fixture participant before play',
    jsonb_build_object('slot', p_slot, 'member_id', v_old_member_id, 'name', v_old_name),
    jsonb_build_object('slot', p_slot, 'member_id', p_new_member_id, 'name', v_new_name)
  );

  v_label := COALESCE(to_char(m.scheduled_date, 'Dy DD Mon'), 'TBD')
             || COALESCE(' ' || to_char(m.scheduled_time, 'HH24:MI'), '');

  v_notify := ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[
    v_old_member_id, p_new_member_id,
    m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id
  ]) AS x WHERE x IS NOT NULL);

  FOREACH v_id IN ARRAY v_notify LOOP
    INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url)
    SELECT cm.user_id, cm.id,
      'Fixture line-up changed',
      COALESCE(v_new_name, 'A player') || ' now replaces ' || COALESCE(v_old_name, 'the previous player')
        || ' in the ' || v_label || ' tournament match. The court and time stay the same.',
      'tournament', '/club-champs/' || m.champ_id::text
    FROM public.club_members cm WHERE cm.id = v_id;
  END LOOP;

  RETURN jsonb_build_object('match_id', p_match_id, 'slot', p_slot, 'member_id', p_new_member_id, 'name', v_new_name);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_replace_champ_player(uuid, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_replace_champ_player(uuid, text, uuid) TO authenticated;