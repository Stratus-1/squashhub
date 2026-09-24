CREATE OR REPLACE FUNCTION public.ai_replace_tournament_player(p_champ_id uuid, p_old_member uuid, p_new_member uuid, p_preview boolean DEFAULT true, p_only_match_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club uuid; v_name text; v_old_name text; v_new_name text; v_new_club uuid;
  v_unplayed uuid[] := '{}'; v_played int := 0; v_changed uuid[] := '{}';
  r record; v_slot text; v_entries int := 0; v_regs int := 0; v_new_entered boolean;
BEGIN
  SELECT club_id, name INTO v_club, v_name FROM public.tournaments WHERE id = p_champ_id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF NOT (public.is_platform_admin(auth.uid())
          OR public.is_club_admin_or_permitted(auth.uid(), v_club, 'champs')
          OR public.can_manage_tournament(p_champ_id)) THEN
    RAISE EXCEPTION 'You do not have permission to manage this tournament';
  END IF;
  IF p_old_member = p_new_member THEN RAISE EXCEPTION 'Those are the same player'; END IF;
  SELECT name INTO v_old_name FROM public.club_members WHERE id = p_old_member;
  SELECT name, club_id INTO v_new_name, v_new_club FROM public.club_members WHERE id = p_new_member;
  IF v_new_club IS NULL THEN RAISE EXCEPTION 'Replacement player not found'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.club_champs_entries e WHERE e.champ_id = p_champ_id
     AND p_new_member IN (e.club_member_id, e.partner_member_id)) INTO v_new_entered;

  FOR r IN SELECT * FROM public.club_champs_matches m WHERE m.champ_id = p_champ_id
     AND p_old_member IN (m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id)
     AND (p_only_match_ids IS NULL OR m.id = ANY(p_only_match_ids)) LOOP
    IF r.status = 'completed' OR r.winner_member_id IS NOT NULL
       OR COALESCE(r.side_a_points,0) > 0 OR COALESCE(r.side_b_points,0) > 0
       OR COALESCE(r.game_scores,'') <> '' OR COALESCE(r.score,'') <> '' THEN
      v_played := v_played + 1;
    ELSIF NOT COALESCE(r.is_bye,false) THEN
      v_unplayed := v_unplayed || r.id;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_entries FROM public.club_champs_entries WHERE champ_id = p_champ_id AND p_old_member IN (club_member_id, partner_member_id);
  SELECT count(*) INTO v_regs FROM public.club_champs_registrations WHERE champ_id = p_champ_id AND p_old_member IN (club_member_id, partner_member_id);

  IF p_preview THEN
    RETURN jsonb_build_object('club_id', v_club, 'tournament', v_name, 'old_name', v_old_name, 'new_name', v_new_name,
      'new_same_club', v_new_club = v_club, 'new_already_entered', v_new_entered,
      'unplayed_matches', to_jsonb(v_unplayed), 'played_matches', v_played, 'entries', v_entries, 'registrations', v_regs);
  END IF;

  IF v_new_entered AND p_only_match_ids IS NULL THEN RAISE EXCEPTION '% is already entered in this tournament', v_new_name; END IF;

  FOREACH r.id IN ARRAY v_unplayed LOOP
    SELECT CASE WHEN player_a_member_id = p_old_member THEN 'player_a' WHEN player_b_member_id = p_old_member THEN 'player_b'
                WHEN partner_a_member_id = p_old_member THEN 'partner_a' ELSE 'partner_b' END
      INTO v_slot FROM public.club_champs_matches WHERE id = r.id;
    PERFORM public.admin_replace_champ_player(r.id, v_slot, p_new_member);
    v_changed := v_changed || r.id;
  END LOOP;

  UPDATE public.club_champs_entries SET
    club_member_id = CASE WHEN club_member_id = p_old_member THEN p_new_member ELSE club_member_id END,
    partner_member_id = CASE WHEN partner_member_id = p_old_member THEN p_new_member ELSE partner_member_id END
  WHERE champ_id = p_champ_id AND p_old_member IN (club_member_id, partner_member_id);
  UPDATE public.club_champs_registrations SET
    club_member_id = CASE WHEN club_member_id = p_old_member THEN p_new_member ELSE club_member_id END,
    partner_member_id = CASE WHEN partner_member_id = p_old_member THEN p_new_member ELSE partner_member_id END,
    updated_at = now()
  WHERE champ_id = p_champ_id AND p_old_member IN (club_member_id, partner_member_id);

  INSERT INTO public.audit_events (club_id, actor_user_id, entity_type, entity_id, action, reason, before_data, after_data)
  VALUES (v_club, auth.uid(), 'tournament', p_champ_id, 'ai_replace_player', 'AI assistant, confirmed by user',
    jsonb_build_object('member_id', p_old_member, 'name', v_old_name),
    jsonb_build_object('member_id', p_new_member, 'name', v_new_name, 'matches', to_jsonb(v_changed), 'played_untouched', v_played));

  RETURN jsonb_build_object('club_id', v_club, 'changed_matches', to_jsonb(v_changed), 'played_untouched', v_played,
    'entries', v_entries, 'registrations', v_regs, 'old_name', v_old_name, 'new_name', v_new_name);
END; $$;
REVOKE EXECUTE ON FUNCTION public.ai_replace_tournament_player(uuid, uuid, uuid, boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_replace_tournament_player(uuid, uuid, uuid, boolean, uuid[]) TO authenticated, service_role;