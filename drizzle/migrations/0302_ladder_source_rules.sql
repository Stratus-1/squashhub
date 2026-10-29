ALTER TABLE public.ladder_configs
  ADD COLUMN IF NOT EXISTS ladder_from_challenges boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ladder_from_system_leagues boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS challenge_approval text NOT NULL DEFAULT 'auto' CHECK (challenge_approval IN ('auto','approve')),
  ADD COLUMN IF NOT EXISTS tournament_approval text NOT NULL DEFAULT 'auto' CHECK (tournament_approval IN ('auto','approve')),
  ADD COLUMN IF NOT EXISTS club_league_approval text NOT NULL DEFAULT 'auto' CHECK (club_league_approval IN ('auto','approve')),
  ADD COLUMN IF NOT EXISTS system_league_approval text NOT NULL DEFAULT 'auto' CHECK (system_league_approval IN ('auto','approve'));

UPDATE public.ladder_configs SET
  challenge_approval = CASE WHEN ladder_auto_apply IS FALSE THEN 'approve' ELSE 'auto' END,
  tournament_approval = CASE WHEN ladder_auto_apply IS FALSE THEN 'approve' ELSE 'auto' END,
  club_league_approval = CASE WHEN ladder_auto_apply IS FALSE THEN 'approve' ELSE 'auto' END,
  system_league_approval = CASE WHEN ladder_auto_apply IS FALSE THEN 'approve' ELSE 'auto' END;

ALTER TABLE public.ladder_configs ALTER COLUMN ladder_from_leagues SET DEFAULT false;
ALTER TABLE public.ladder_configs ALTER COLUMN ladder_from_tournaments SET DEFAULT false;
UPDATE public.ladder_configs SET ladder_from_leagues = false, ladder_from_tournaments = false;
COMMENT ON COLUMN public.ladder_configs.ladder_from_leagues IS 'Club Leagues (internal scope) move the club ladder';
COMMENT ON COLUMN public.ladder_configs.ladder_auto_apply IS 'DEPRECATED: replaced by per-source *_approval columns';

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS ladder_affects boolean,
  ADD COLUMN IF NOT EXISTS ladder_update_mode text NOT NULL DEFAULT 'match' CHECK (ladder_update_mode IN ('match','final_standings'));

ALTER TABLE public.ladder_moves_pending DROP CONSTRAINT ladder_moves_pending_status_check;
ALTER TABLE public.ladder_moves_pending ADD CONSTRAINT ladder_moves_pending_status_check CHECK (status IN ('pending','approved','rejected','stale'));

CREATE OR REPLACE FUNCTION public.apply_ladder_result(_club_id uuid, _winner_member_id uuid, _loser_member_id uuid, _movement text DEFAULT 'insert', _source text DEFAULT NULL, _source_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mode text;
  w_rank integer; l_rank integer;
BEGIN
  SELECT CASE
    WHEN _source = 'challenge' THEN lc.challenge_approval
    WHEN _source = 'tournament' THEN lc.tournament_approval
    WHEN _source = 'system_league' THEN lc.system_league_approval
    WHEN _source IN ('league','club_league') THEN lc.club_league_approval
    ELSE CASE WHEN lc.ladder_auto_apply IS FALSE THEN 'approve' ELSE 'auto' END END
  INTO v_mode FROM public.ladder_configs lc WHERE lc.club_id = _club_id;

  IF COALESCE(v_mode, 'auto') = 'auto' THEN
    RETURN public.ladder_move_apply_now(_club_id, _winner_member_id, _loser_member_id, _movement);
  END IF;

  SELECT ladder_position INTO w_rank FROM public.club_members WHERE id = _winner_member_id AND club_id = _club_id;
  SELECT ladder_position INTO l_rank FROM public.club_members WHERE id = _loser_member_id AND club_id = _club_id;
  IF w_rank IS NULL OR l_rank IS NULL OR w_rank <= l_rank THEN RETURN false; END IF;
  IF NOT public.is_rankable_member(_winner_member_id) OR NOT public.is_rankable_member(_loser_member_id) THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM public.ladder_moves_pending p
    WHERE p.club_id = _club_id AND p.status = 'pending'
      AND p.winner_member_id = _winner_member_id AND p.loser_member_id = _loser_member_id
      AND p.source IS NOT DISTINCT FROM _source AND p.source_id IS NOT DISTINCT FROM _source_id) THEN
    RETURN false;
  END IF;

  INSERT INTO public.ladder_moves_pending (club_id, winner_member_id, loser_member_id, movement, source, source_id, winner_position, loser_position)
  VALUES (_club_id, _winner_member_id, _loser_member_id,
          CASE WHEN lower(COALESCE(_movement,'')) = 'swap' THEN 'swap' ELSE 'insert' END,
          _source, _source_id, w_rank, l_rank);
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_ladder_move_pending(_pending_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.ladder_moves_pending%ROWTYPE;
  v_ok boolean;
  w_now integer; l_now integer;
BEGIN
  SELECT * INTO p FROM public.ladder_moves_pending WHERE id = _pending_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Pending ladder move not found'; END IF;
  IF NOT public.is_club_admin_or_permitted(auth.uid(), p.club_id, 'ladder') THEN
    RAISE EXCEPTION 'Not authorised to approve ladder moves for this club';
  END IF;
  IF p.status <> 'pending' THEN RETURN false; END IF;

  SELECT ladder_position INTO w_now FROM public.club_members WHERE id = p.winner_member_id AND club_id = p.club_id;
  SELECT ladder_position INTO l_now FROM public.club_members WHERE id = p.loser_member_id AND club_id = p.club_id;

  IF w_now IS DISTINCT FROM p.winner_position OR l_now IS DISTINCT FROM p.loser_position THEN
    UPDATE public.ladder_moves_pending SET status = 'stale', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = _pending_id;
    RETURN false;
  END IF;

  v_ok := public.ladder_move_apply_now(p.club_id, p.winner_member_id, p.loser_member_id, p.movement);

  UPDATE public.ladder_moves_pending
     SET status = CASE WHEN v_ok THEN 'approved' ELSE 'stale' END, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   WHERE id = _pending_id;

  IF v_ok THEN
    INSERT INTO public.ladder_adjustment_log (club_id, member_id, old_position, new_position, reason, adjusted_by)
    VALUES (p.club_id, p.winner_member_id, p.winner_position, p.loser_position,
            'Approved ladder move from ' || COALESCE(p.source,'competition') || ' result', auth.uid());
  END IF;
  RETURN v_ok;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_points_for_league_rubber()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_winner uuid; v_loser uuid; v_wc uuid; v_lc uuid;
  v_scope text; v_team uuid; v_override boolean; v_timing text;
  v_club_on boolean; v_sys_on boolean; v_move text; v_is_system boolean;
BEGIN
  IF NEW.winner IS NULL OR NEW.winner NOT IN ('home','away') THEN RETURN NEW; END IF;
  IF NEW.home_player_member_id IS NULL OR NEW.away_player_member_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.winner IS NOT DISTINCT FROM NEW.winner
     AND OLD.home_player_member_id IS NOT DISTINCT FROM NEW.home_player_member_id
     AND OLD.away_player_member_id IS NOT DISTINCT FROM NEW.away_player_member_id THEN
    RETURN NEW;
  END IF;

  IF NEW.winner = 'home' THEN v_winner := NEW.home_player_member_id; v_loser := NEW.away_player_member_id;
  ELSE v_winner := NEW.away_player_member_id; v_loser := NEW.home_player_member_id; END IF;

  SELECT club_id INTO v_wc FROM public.club_members WHERE id = v_winner;
  SELECT club_id INTO v_lc FROM public.club_members WHERE id = v_loser;
  IF v_wc IS NULL OR v_wc IS DISTINCT FROM v_lc THEN RETURN NEW; END IF;

  PERFORM public.award_ranking_points_for_result(v_wc, v_winner, v_loser, 'league', NEW.id);

  SELECT la.scope, f.home_team_id INTO v_scope, v_team
  FROM public.platform_league_fixtures f
  LEFT JOIN public.league_associations la ON la.id = f.association_id
  WHERE f.id = NEW.fixture_id;
  v_is_system := COALESCE(v_scope, 'internal') <> 'internal';

  IF v_team IS NOT NULL THEN
    SELECT ladder_affects, ladder_update_mode INTO v_override, v_timing FROM public.leagues WHERE id = v_team;
  END IF;
  IF v_timing = 'final_standings' THEN RETURN NEW; END IF;

  SELECT COALESCE(lc.ladder_from_leagues,false), COALESCE(lc.ladder_from_system_leagues,false),
         COALESCE(lc.league_movement_policy, lc.movement_policy, 'insert')
    INTO v_club_on, v_sys_on, v_move
  FROM public.ladder_configs lc WHERE lc.club_id = v_wc;

  IF v_is_system THEN
    IF v_sys_on IS TRUE AND COALESCE(v_override, true) IS TRUE THEN
      PERFORM public.apply_ladder_result(v_wc, v_winner, v_loser, COALESCE(v_move,'insert'), 'system_league', NEW.id);
    END IF;
  ELSE
    IF v_club_on IS TRUE AND COALESCE(v_override, true) IS TRUE THEN
      PERFORM public.apply_ladder_result(v_wc, v_winner, v_loser, COALESCE(v_move,'insert'), 'club_league', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_points_for_champ_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club_id uuid; v_loser uuid; v_override boolean; v_enabled boolean; v_move text; v_timing text;
BEGIN
 IF NEW.winner_member_id IS NULL OR COALESCE(NEW.is_bye,false) OR NEW.partner_a_member_id IS NOT NULL OR NEW.partner_b_member_id IS NOT NULL OR lower(COALESCE(NEW.status,'')) NOT IN ('completed','confirmed','finished') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.winner_member_id IS NOT DISTINCT FROM NEW.winner_member_id AND lower(COALESCE(OLD.status,'')) IN ('completed','confirmed','finished') THEN RETURN NEW; END IF;
 IF NEW.player_a_member_id IS NULL OR NEW.player_b_member_id IS NULL THEN RETURN NEW; END IF;
 v_loser:=CASE WHEN NEW.winner_member_id=NEW.player_a_member_id THEN NEW.player_b_member_id ELSE NEW.player_a_member_id END;
 SELECT club_id,ladder_affects,ladder_update_mode INTO v_club_id,v_override,v_timing FROM public.tournaments WHERE id=NEW.champ_id;
 IF v_club_id IS NULL THEN RETURN NEW; END IF;
 PERFORM public.award_ranking_points_for_result(v_club_id,NEW.winner_member_id,v_loser,'tournament',NEW.id);
 IF v_timing='final_standings' THEN RETURN NEW; END IF;
 SELECT COALESCE(ladder_from_tournaments,false),COALESCE(tournament_movement_policy,movement_policy,'insert') INTO v_enabled,v_move FROM public.ladder_configs WHERE club_id=v_club_id;
 IF v_enabled IS TRUE AND COALESCE(v_override,true) IS TRUE THEN PERFORM public.apply_ladder_result(v_club_id,NEW.winner_member_id,v_loser,COALESCE(v_move,'insert'),'tournament',NEW.id); END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.league_set_ladder_rule(p_league_id uuid, p_affects boolean, p_timing text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid;
BEGIN
  IF p_timing NOT IN ('match','final_standings') THEN RAISE EXCEPTION 'Invalid timing'; END IF;
  SELECT club_id INTO v_club FROM public.leagues WHERE id = p_league_id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'League not found'; END IF;
  IF NOT (public.is_club_admin_or_permitted(auth.uid(), v_club, 'ladder') OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.leagues SET ladder_affects = p_affects, ladder_update_mode = p_timing WHERE id = p_league_id;
END $$;
REVOKE ALL ON FUNCTION public.league_set_ladder_rule(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_set_ladder_rule(uuid,boolean,text) TO authenticated;