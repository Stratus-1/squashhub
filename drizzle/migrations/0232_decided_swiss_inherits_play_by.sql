CREATE OR REPLACE FUNCTION public.create_decided_swiss_game(p_tid uuid, p_group integer, p_round integer, p_a uuid, p_b uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_prev record; v_round_id uuid; v_id uuid; v_sch jsonb; v_pb date;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT stage_id, division_id, stage_key, stage INTO v_prev FROM public.club_champs_matches
   WHERE champ_id = p_tid AND group_number = p_group AND round_number = p_round - 1 AND stage_id IS NOT NULL
   ORDER BY created_at LIMIT 1;
  IF v_prev.stage_id IS NULL THEN RAISE EXCEPTION 'No previous Swiss round found' USING ERRCODE = '23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('swiss-stage:' || v_prev.stage_id::text));
  SELECT id INTO v_id FROM public.club_champs_matches
   WHERE stage_id = v_prev.stage_id AND round_number = p_round
     AND ((player_a_member_id = p_a AND player_b_member_id = p_b) OR (player_a_member_id = p_b AND player_b_member_id = p_a));
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  -- A play-by stage keeps its play-by deadline for every round; never a timed/court round.
  SELECT config->'schedule' INTO v_sch FROM public.tournament_stages WHERE id = v_prev.stage_id;
  IF v_sch->>'rule' = 'play_by' THEN
    v_pb := nullif(coalesce(v_sch->'roundDates'->>(p_round - 1), v_sch->>'deadline'), '')::date;
  END IF;
  SELECT id INTO v_round_id FROM public.club_champs_rounds
   WHERE champ_id = p_tid AND stage_id = v_prev.stage_id AND round_number = p_round ORDER BY created_at LIMIT 1;
  IF v_round_id IS NULL THEN
    INSERT INTO public.club_champs_rounds(champ_id, group_number, round_number, division_id, stage_id, stage_key, round_type, label, status, scheduling_mode, play_by)
    VALUES (p_tid, p_group, p_round, v_prev.division_id, v_prev.stage_id, v_prev.stage_key, 'swiss', 'Round ' || p_round, 'active',
            CASE WHEN v_pb IS NULL THEN 'club' ELSE 'self' END, v_pb)
    RETURNING id INTO v_round_id;
  END IF;
  PERFORM set_config('app.swiss_decided_game', 'on', true);
  INSERT INTO public.club_champs_matches(champ_id, group_number, round_number, stage, stage_key, stage_id, division_id, round_id, status, player_a_member_id, player_b_member_id, play_by)
  VALUES (p_tid, p_group, p_round, coalesce(v_prev.stage, 'group'), v_prev.stage_key, v_prev.stage_id, v_prev.division_id, v_round_id, 'scheduled', p_a, p_b,
          (SELECT play_by FROM public.club_champs_rounds WHERE id = v_round_id))
  RETURNING id INTO v_id;
  PERFORM set_config('app.swiss_decided_game', 'off', true);
  RETURN v_id;
END;
$function$;