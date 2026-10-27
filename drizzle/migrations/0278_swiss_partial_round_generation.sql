-- Pilot flag: per-club opt-in for settled-position Swiss fixture creation (Riverside pilot).
ALTER TABLE public.club_beta_features DROP CONSTRAINT club_beta_features_feature_check;
ALTER TABLE public.club_beta_features ADD CONSTRAINT club_beta_features_feature_check
  CHECK ((feature = ANY (ARRAY['tournament_beta'::text, 'ai_actions'::text, 'tournament_viewer_shell'::text, 'tournament_swiss_progression_view'::text, 'tournament_pool_matrix_view'::text, 'tournament_bracket_view'::text, 'tournament_schedule_board'::text, 'tournament_swiss_category_rounds'::text, 'tournament_swiss_positional_draw'::text, 'tournament_stage_planner'::text, 'tournament_structure_step'::text, 'tournament_card_structure'::text, 'tournament_swiss_partial_rounds'::text])));

-- Certified round-robin finish block: the engine only calls this with p_rr_finish_block = true
-- after proving (by enumerating every outcome of the outstanding Swiss games) that the group
-- positions are final. The guard then checks the mechanical precondition it can verify:
-- both players completed the Swiss qualifying rounds (round 2).
CREATE OR REPLACE FUNCTION public.create_decided_swiss_game(p_tid uuid, p_group integer, p_round integer, p_a uuid, p_b uuid, p_rr_finish_block boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  IF p_rr_finish_block THEN PERFORM set_config('app.swiss_rr_finish_block', 'on', true); END IF;
  INSERT INTO public.club_champs_matches(champ_id, group_number, round_number, stage, stage_key, stage_id, division_id, round_id, status, player_a_member_id, player_b_member_id, play_by)
  VALUES (p_tid, p_group, p_round, coalesce(v_prev.stage, 'group'), v_prev.stage_key, v_prev.stage_id, v_prev.division_id, v_round_id, 'scheduled', p_a, p_b,
          (SELECT play_by FROM public.club_champs_rounds WHERE id = v_round_id))
  RETURNING id INTO v_id;
  PERFORM set_config('app.swiss_rr_finish_block', 'off', true);
  PERFORM set_config('app.swiss_decided_game', 'off', true);
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_swiss_round_progression()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kind text;
  v_rounds int;
  v_prev int;
  v_open int;
  v_cfg jsonb;
BEGIN
  IF NEW.stage_id IS NULL THEN RETURN NEW; END IF;
  SELECT kind, NULLIF(config->>'swissRounds','')::int, config INTO v_kind, v_rounds, v_cfg FROM public.tournament_stages WHERE id = NEW.stage_id;
  IF v_kind IS DISTINCT FROM 'swiss' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('swiss-stage:' || NEW.stage_id::text));
  IF COALESCE(NEW.round_number, 1) < 1 THEN
    RAISE EXCEPTION 'Swiss round number must be 1 or more' USING ERRCODE = '23514';
  END IF;
  IF v_rounds IS NOT NULL AND COALESCE(NEW.round_number, 1) > v_rounds THEN
    RAISE EXCEPTION 'This Swiss stage has only % rounds — standings are final', v_rounds USING ERRCODE = '23514';
  END IF;
  IF COALESCE(NEW.round_number, 1) = 1 THEN RETURN NEW; END IF;
  SELECT MAX(COALESCE(round_number, 1)) INTO v_prev FROM public.club_champs_matches
   WHERE stage_id = NEW.stage_id AND COALESCE(round_number, 1) < NEW.round_number;
  IF v_prev IS NULL OR v_prev <> NEW.round_number - 1 THEN
    RAISE EXCEPTION 'Swiss Round % can only follow Round % (no skipping rounds)', NEW.round_number, NEW.round_number - 1 USING ERRCODE = '23514';
  END IF;
  IF current_setting('app.swiss_decided_game', true) = 'on' THEN
    -- Per-game rule: each player finished (or had a bye in) the previous round, and is not already in this round.
    IF NEW.player_a_member_id IS NULL OR NEW.player_b_member_id IS NULL OR NEW.player_a_member_id = NEW.player_b_member_id THEN
      RAISE EXCEPTION 'Decided Swiss game needs two different players' USING ERRCODE = '23514';
    END IF;
    IF current_setting('app.swiss_rr_finish_block', true) = 'on'
       AND COALESCE(v_cfg->'rrFinish'->>'enabled', 'false') = 'true' THEN
      -- Certified round-robin finish: group positions proven final by the engine, so rounds 3+
      -- may be created while earlier round-robin rounds are still being played. The database
      -- can only verify the mechanical precondition: both players completed qualifying round 2.
      IF NEW.round_number < 3 THEN
        RAISE EXCEPTION 'Round-robin finish block mode only applies from Round 3' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (
        SELECT 1 FROM (VALUES (NEW.player_a_member_id), (NEW.player_b_member_id)) p(id)
         WHERE NOT EXISTS (
           SELECT 1 FROM public.club_champs_matches m
            WHERE m.stage_id = NEW.stage_id AND COALESCE(m.round_number, 1) = 2
              AND (m.player_a_member_id = p.id OR m.player_b_member_id = p.id OR m.bye_member_id = p.id)
              AND (COALESCE(m.is_bye, false) OR m.winner_member_id IS NOT NULL
                   OR lower(COALESCE(m.status, '')) IN ('completed','walkover','bye','forfeit')))) THEN
        RAISE EXCEPTION 'Both players must finish the Swiss qualifying rounds first' USING ERRCODE = '23514';
      END IF;
    ELSIF EXISTS (
      SELECT 1 FROM (VALUES (NEW.player_a_member_id), (NEW.player_b_member_id)) p(id)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.club_champs_matches m
          WHERE m.stage_id = NEW.stage_id AND COALESCE(m.round_number, 1) = v_prev
            AND (m.player_a_member_id = p.id OR m.player_b_member_id = p.id OR m.bye_member_id = p.id)
            AND (COALESCE(m.is_bye, false) OR m.winner_member_id IS NOT NULL
                 OR lower(COALESCE(m.status, '')) IN ('completed','walkover','bye','forfeit')))) THEN
      RAISE EXCEPTION 'Both players must finish Round % first', v_prev USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.club_champs_matches m
       WHERE m.stage_id = NEW.stage_id AND COALESCE(m.round_number, 1) = NEW.round_number
         AND m.id <> NEW.id
         AND (m.player_a_member_id IN (NEW.player_a_member_id, NEW.player_b_member_id)
           OR m.player_b_member_id IN (NEW.player_a_member_id, NEW.player_b_member_id))) THEN
      RAISE EXCEPTION 'A player already has a Round % game', NEW.round_number USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
  END IF;
  SELECT COUNT(*) INTO v_open FROM public.club_champs_matches
   WHERE stage_id = NEW.stage_id AND COALESCE(round_number, 1) = v_prev
     AND NOT COALESCE(is_bye, false)
     AND player_a_member_id IS NOT NULL AND player_b_member_id IS NOT NULL
     AND winner_member_id IS NULL
     AND COALESCE(score, '') NOT LIKE 'No result%'
     AND lower(COALESCE(status, '')) NOT IN ('completed','walkover','cancelled','canceled','void','voided','bye','forfeit');
  IF v_open > 0 THEN
    RAISE EXCEPTION 'Finish the % remaining Round % match(es) before generating Round %', v_open, v_prev, NEW.round_number USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;