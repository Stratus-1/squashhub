ALTER TABLE public.ladder_configs ADD COLUMN IF NOT EXISTS pyramid_allow_same_row boolean NOT NULL DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS ladder_effects_applied_at timestamptz;
DO $patch$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.validate_challenge_insert()'::regprocedure) INTO definition;
  IF position('op_row <> ch_row - 1 THEN' in definition)=0 THEN RAISE EXCEPTION 'Unexpected pyramid validator'; END IF;
  definition := replace(definition,'op_row <> ch_row - 1 THEN','(op_row <> ch_row - 1 AND NOT (COALESCE(cfg.pyramid_allow_same_row,false) AND op_row = ch_row)) THEN');
  definition := replace(definition,'You may only challenge players in the row directly above you','You may only challenge higher-ranked players in an allowed pyramid row');
  EXECUTE definition;
  SELECT pg_get_functiondef('public.apply_confirmed_match_effects()'::regprocedure) INTO definition;
  IF position('IF NEW.confirmed IS NOT TRUE OR OLD.confirmed IS TRUE THEN' in definition)=0 THEN RAISE EXCEPTION 'Unexpected confirmation handler'; END IF;
  definition := replace(definition,'IF NEW.confirmed IS NOT TRUE OR OLD.confirmed IS TRUE THEN', 'IF NEW.club_id = ''061e6dd9-0ec2-4427-a939-3f18ad0884c8'' AND (NEW.challenge_id IS NOT NULL OR NEW.source_type = ''ladder'') THEN RETURN NEW; END IF; IF NEW.confirmed IS NOT TRUE OR OLD.confirmed IS TRUE THEN');
  EXECUTE definition;
END;
$patch$;
CREATE OR REPLACE FUNCTION public.nsc_confirmed_ladder_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_winner uuid; v_loser uuid; v_source uuid; cfg public.ladder_configs%ROWTYPE;
BEGIN
  IF NEW.club_id <> '061e6dd9-0ec2-4427-a939-3f18ad0884c8' OR NEW.club_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.confirmed IS NOT TRUE OR COALESCE(NEW.disputed,false) OR NEW.ladder_effects_applied_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.challenge_id IS NULL AND NEW.source_type IS DISTINCT FROM 'ladder' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.confirmed IS TRUE THEN RETURN NEW; END IF;
  END IF;
  v_winner := NEW.winner_member_id;
  IF v_winner IS NULL OR v_winner NOT IN (NEW.player_a_member_id, NEW.player_b_member_id)
     OR NEW.player_a_member_id IS NULL OR NEW.player_b_member_id IS NULL THEN RETURN NEW; END IF;
  v_loser := CASE WHEN v_winner = NEW.player_a_member_id THEN NEW.player_b_member_id ELSE NEW.player_a_member_id END;
  IF v_winner = v_loser OR (SELECT count(*) FROM public.club_members WHERE club_id=NEW.club_id AND id IN (v_winner,v_loser)) <> 2 THEN RETURN NEW; END IF;
  IF NEW.challenge_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.challenges WHERE id=NEW.challenge_id AND club_id=NEW.club_id
      AND ((challenger_member_id=v_winner AND opponent_member_id=v_loser)
        OR (challenger_member_id=v_loser AND opponent_member_id=v_winner))
  ) THEN RETURN NEW; END IF;
  SELECT * INTO cfg FROM public.ladder_configs WHERE club_id=NEW.club_id;
  v_source := COALESCE(NEW.challenge_id,NEW.id);
  IF COALESCE(cfg.affects_club_ranking,false) THEN
    PERFORM public.award_ranking_points_for_result(NEW.club_id,v_winner,v_loser,'challenge',v_source);
  END IF;
  PERFORM public.apply_ladder_result(NEW.club_id,v_winner,v_loser,COALESCE(cfg.movement_policy,'insert'),'challenge',v_source);
  NEW.ladder_effects_applied_at := now();
  IF NEW.challenge_id IS NOT NULL THEN
    UPDATE public.challenges SET status='completed',updated_at=now() WHERE id=NEW.challenge_id AND club_id=NEW.club_id AND status<>'completed';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.nsc_confirmed_ladder_result() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nsc_confirmed_ladder_result() TO service_role;
CREATE TRIGGER nsc_confirmed_ladder_result BEFORE INSERT OR UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.nsc_confirmed_ladder_result();
