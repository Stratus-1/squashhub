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
  -- Prior rounds only (rows of the round being created in this same batch are ignored).
  SELECT MAX(COALESCE(round_number, 1)) INTO v_prev FROM public.club_champs_matches
   WHERE stage_id = NEW.stage_id AND COALESCE(round_number, 1) < NEW.round_number;
  IF v_prev IS NULL OR v_prev <> NEW.round_number - 1 THEN
    RAISE EXCEPTION 'Swiss Round % can only follow Round % (no skipping rounds)', NEW.round_number, NEW.round_number - 1 USING ERRCODE = '23514';
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