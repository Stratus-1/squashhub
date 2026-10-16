-- Swiss game-by-game creation: a next-round game may be created as soon as BOTH players have finished
-- their previous-round game. Only through create_decided_swiss_game (service role), flagged per transaction.
CREATE OR REPLACE FUNCTION public.guard_swiss_round_progression()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_kind text;
  v_rounds int;
  v_prev int;
  v_open int;
BEGIN
  IF NEW.stage_id IS NULL THEN RETURN NEW; END IF;
  SELECT kind, NULLIF(config->>'swissRounds','')::int INTO v_kind, v_rounds FROM public.tournament_stages WHERE id = NEW.stage_id;
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
    IF EXISTS (
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
$$;

CREATE OR REPLACE FUNCTION public.guard_structured_stage_round_once()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stage_id IS NULL THEN RETURN NEW; END IF;
  -- Decided Swiss games are added one at a time; the Swiss guard enforces per-player uniqueness instead.
  IF current_setting('app.swiss_decided_game', true) = 'on' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('stage-round:' || NEW.stage_id::text || ':' || COALESCE(NEW.round_number, 0)::text));
  IF EXISTS (
    SELECT 1 FROM public.club_champs_matches m
     WHERE m.stage_id = NEW.stage_id
       AND COALESCE(m.round_number, 0) = COALESCE(NEW.round_number, 0)
       AND m.xmin <> pg_current_xact_id()::xid) THEN
    RAISE EXCEPTION 'This stage round already has games (already generated)' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

-- Creates one results-decided next-round Swiss game as a normal fixture. Idempotent: returns the existing
-- game when this pair is already in that round. Server-only (service role).
CREATE OR REPLACE FUNCTION public.create_decided_swiss_game(p_tid uuid, p_group integer, p_round integer, p_a uuid, p_b uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev record;
  v_round_id uuid;
  v_id uuid;
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
  SELECT id INTO v_round_id FROM public.club_champs_rounds
   WHERE champ_id = p_tid AND stage_id = v_prev.stage_id AND round_number = p_round ORDER BY created_at LIMIT 1;
  IF v_round_id IS NULL THEN
    INSERT INTO public.club_champs_rounds(champ_id, group_number, round_number, division_id, stage_id, stage_key, round_type, label, status, scheduling_mode)
    VALUES (p_tid, p_group, p_round, v_prev.division_id, v_prev.stage_id, v_prev.stage_key, 'swiss', 'Round ' || p_round, 'active', 'club')
    RETURNING id INTO v_round_id;
  END IF;
  PERFORM set_config('app.swiss_decided_game', 'on', true);
  INSERT INTO public.club_champs_matches(champ_id, group_number, round_number, stage, stage_key, stage_id, division_id, round_id, status, player_a_member_id, player_b_member_id)
  VALUES (p_tid, p_group, p_round, coalesce(v_prev.stage, 'group'), v_prev.stage_key, v_prev.stage_id, v_prev.division_id, v_round_id, 'scheduled', p_a, p_b)
  RETURNING id INTO v_id;
  PERFORM set_config('app.swiss_decided_game', 'off', true);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_decided_swiss_game(uuid, integer, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_decided_swiss_game(uuid, integer, integer, uuid, uuid) TO service_role;