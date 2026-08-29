-- 1. Per-competition ranking weight
ALTER TABLE public.tournament_rules ADD COLUMN IF NOT EXISTS ranking_weight numeric NOT NULL DEFAULT 1;
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS ranking_weight numeric NOT NULL DEFAULT 1;
ALTER TABLE public.leagues ALTER COLUMN affects_ranking_points SET DEFAULT true;

-- 2. Expose ranking_weight through the club_champs compatibility view
CREATE OR REPLACE VIEW public.club_champs AS
 SELECT t.id, t.club_id, t.owner_org_id, t.name, t.gender, t.status, t.num_groups,
    t.start_date, t.end_date, t.play_days, t.start_time, t.end_time,
    t.match_duration_minutes, t.created_at, t.updated_at, t.match_type,
    t.enable_playoffs, t.source_league_id, t.source_league_ids, t.partner_mode,
    t.entries_locked, t.invite_methods, t.description, t.group_durations,
    t.include_visitors, t.visitor_clubs, t.day_schedules, t.court_ids,
    t.court_rotation_minutes, t.group_break_minutes, t.default_break_minutes,
    t.invite_source, t.invite_include_reserves, t.invite_excluded_member_ids,
    t.group_labels, t.swiss_pools, t.swiss_rounds, t.avoid_back_to_back,
    t.schedule_mode, t.playoff_break_minutes, t.playoff_date, t.league_formats,
    t.expected_players, t.league_win_conditions,
    g.sanction_status, g.sanctioning_org_id, g.sanction_reference, g.sanction_notes,
    g.sanctioned_at, g.sanctioned_by, g.competition_level, g.eligibility_min_age,
    g.eligibility_max_age, g.eligibility_requires_licence, g.eligibility_scope,
    g.eligibility_notes, g.registration_required, g.registration_mode,
    g.registration_opens_at, g.registration_closes_at, g.entry_fee_cents,
    g.federation_fee_cents, g.association_fee_cents, g.payment_methods,
    g.payment_required, g.refund_policy, g.refund_cutoff_date,
    r.scoring_mode, r.draw_type, r.standard_of_play, r.round_format, r.best_of,
    r.points_per_game, r.win_condition, r.handicap_mode, r.handicap_multiplier,
    r.handicap_divider, r.bye_handling, r.play_all_games, r.affects_ranking_points,
    r.no_show_opponent_points, r.no_show_player_points,
    g.entry_source, g.approval_gate, g.payment_timing,
    t.league_sections, t.knockout_seeds, t.knockout_seeds_at, t.invite_audience,
    t.invite_audience_league_ids, t.invite_audience_member_ids,
    t.invite_audience_include_individuals, t.scheduling_mode, t.round_play_by,
    t.champion_scope, t.pool_sizes, t.pool_allocation, t.invite_audience_club_ids,
    t.league_draw_styles, t.ladder_affects,
    r.ranking_weight
   FROM tournaments t
     LEFT JOIN tournament_governance g ON g.tournament_id = t.id
     LEFT JOIN tournament_rules r ON r.tournament_id = t.id;

CREATE OR REPLACE FUNCTION public.club_champs_compat_extra_insert()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.tournaments SET
    league_draw_styles = COALESCE(NEW.league_draw_styles, league_draw_styles),
    ladder_affects = NEW.ladder_affects
  WHERE id = NEW.id;
  UPDATE public.tournament_rules SET
    ranking_weight = COALESCE(NEW.ranking_weight, ranking_weight)
  WHERE tournament_id = NEW.id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.club_champs_compat_extra_update()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.tournaments SET
    league_draw_styles = COALESCE(NEW.league_draw_styles, league_draw_styles),
    ladder_affects = NEW.ladder_affects
  WHERE id = OLD.id;
  UPDATE public.tournament_rules SET
    ranking_weight = COALESCE(NEW.ranking_weight, ranking_weight)
  WHERE tournament_id = OLD.id;
  RETURN NEW;
END;
$function$;

-- 3. Unified dispatch: single engine now takes a per-competition weight
DROP FUNCTION IF EXISTS public.award_ranking_points_for_result(uuid, uuid, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.award_ranking_points_for_result(
  _club_id uuid, _winner_member_id uuid, _loser_member_id uuid,
  _source_type text, _source_id uuid, _weight numeric DEFAULT 1)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD; lc RECORD;
  w_rank integer; l_rank integer;
  w_points numeric; l_points numeric;
  gap integer;
  w_delta numeric := 0; l_delta numeric := 0;
  v_mode text := 'formula';
  v_pending uuid;
  v_wb numeric; v_lb numeric;
  v_w numeric := COALESCE(_weight, 1);
BEGIN
  IF _winner_member_id IS NULL OR _loser_member_id IS NULL OR _winner_member_id = _loser_member_id THEN
    RETURN NULL;
  END IF;
  IF v_w <= 0 THEN RETURN NULL; END IF;

  IF NOT public.is_rankable_member(_winner_member_id)
     OR NOT public.is_rankable_member(_loser_member_id) THEN
    RETURN NULL;
  END IF;

  SELECT ranking_points_enabled, points_base_win, points_upset_bonus_per_rank,
         points_favourite_win_min, points_loser_deduction,
         points_from_challenges, points_from_leagues, points_from_tournaments
    INTO c FROM public.clubs WHERE id = _club_id;
  IF NOT FOUND OR COALESCE(c.ranking_points_enabled,false) IS NOT TRUE THEN RETURN NULL; END IF;

  IF _source_type = 'challenge' AND c.points_from_challenges IS NOT TRUE THEN RETURN NULL; END IF;
  IF _source_type = 'league' AND c.points_from_leagues IS NOT TRUE THEN RETURN NULL; END IF;
  IF _source_type = 'tournament' AND c.points_from_tournaments IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT * INTO lc FROM public.ladder_configs WHERE club_id = _club_id;

  SELECT r.rn INTO w_rank FROM (
    SELECT id, row_number() OVER (ORDER BY COALESCE(ranking_points,0) DESC, name) rn
    FROM public.club_members WHERE club_id = _club_id AND public.is_rankable_member(id)
  ) r WHERE r.id = _winner_member_id;
  SELECT r.rn INTO l_rank FROM (
    SELECT id, row_number() OVER (ORDER BY COALESCE(ranking_points,0) DESC, name) rn
    FROM public.club_members WHERE club_id = _club_id AND public.is_rankable_member(id)
  ) r WHERE r.id = _loser_member_id;

  SELECT COALESCE(ranking_points,0) INTO w_points FROM public.club_members WHERE id = _winner_member_id;
  SELECT COALESCE(ranking_points,0) INTO l_points FROM public.club_members WHERE id = _loser_member_id;

  IF _source_type = 'challenge' THEN
    v_mode := COALESCE(lc.ranking_sync_mode, 'formula');
  END IF;
  IF v_mode = 'none' THEN RETURN NULL; END IF;

  IF v_mode = 'mirror' THEN
    IF w_points <= l_points THEN
      w_delta := round((l_points - w_points) + COALESCE(lc.ranking_mirror_margin, 1), 2);
    ELSE
      w_delta := 0;
    END IF;
    l_delta := 0;
  ELSE
    IF w_rank IS NULL OR l_rank IS NULL THEN
      w_delta := round(COALESCE(c.points_base_win,0.25) * v_w, 2);
      l_delta := round(-COALESCE(c.points_loser_deduction,0) * v_w, 2);
    ELSE
      gap := l_rank - w_rank;
      IF gap < 0 THEN
        w_delta := round((COALESCE(c.points_base_win,0.25) + COALESCE(c.points_upset_bonus_per_rank,0.1) * abs(gap)) * v_w, 2);
        l_delta := round(-COALESCE(c.points_loser_deduction,0) * v_w, 2);
      ELSE
        w_delta := round(greatest(COALESCE(c.points_base_win,0.25) - 0.02 * gap, COALESCE(c.points_favourite_win_min,0.1)) * v_w, 2);
        l_delta := 0;
      END IF;
    END IF;
  END IF;

  IF w_delta = 0 AND l_delta = 0 THEN RETURN NULL; END IF;

  IF _source_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ranking_points_pending
    WHERE club_id = _club_id AND match_source_type = _source_type AND match_source_id = _source_id
      AND winner_member_id = _winner_member_id AND loser_member_id = _loser_member_id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ranking_points_pending (
    club_id, match_source_type, match_source_id, winner_member_id, loser_member_id,
    winner_rank_at_match, loser_rank_at_match, winner_delta, loser_delta, status
  ) VALUES (
    _club_id, _source_type, _source_id, _winner_member_id, _loser_member_id,
    w_rank, l_rank, w_delta, l_delta,
    CASE WHEN _source_type = 'challenge' AND COALESCE(lc.ranking_auto_approve,false) THEN 'approved' ELSE 'pending' END
  ) RETURNING id INTO v_pending;

  IF _source_type = 'challenge' AND COALESCE(lc.ranking_auto_approve,false) THEN
    UPDATE public.club_members SET ranking_points = COALESCE(ranking_points,0) + w_delta
      WHERE id = _winner_member_id RETURNING ranking_points INTO v_wb;
    UPDATE public.club_members SET ranking_points = COALESCE(ranking_points,0) + l_delta
      WHERE id = _loser_member_id RETURNING ranking_points INTO v_lb;
    UPDATE public.ranking_points_pending SET reviewed_at = now() WHERE id = v_pending;
  END IF;

  RETURN v_pending;
END;
$function$;

-- 4. Championship trigger honours the tournament's own ranking switch + weight
CREATE OR REPLACE FUNCTION public.award_points_for_champ_match()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id uuid; v_loser uuid; v_override boolean;
  v_enabled boolean; v_move text;
  v_ranked boolean; v_weight numeric;
BEGIN
  IF NEW.winner_member_id IS NULL OR COALESCE(NEW.is_bye,false) IS TRUE THEN RETURN NEW; END IF;
  IF NEW.partner_a_member_id IS NOT NULL OR NEW.partner_b_member_id IS NOT NULL THEN RETURN NEW; END IF;
  IF lower(COALESCE(NEW.status,'')) NOT IN ('completed','confirmed','finished') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.winner_member_id IS NOT DISTINCT FROM NEW.winner_member_id
     AND lower(COALESCE(OLD.status,'')) IN ('completed','confirmed','finished') THEN
    RETURN NEW;
  END IF;
  IF NEW.player_a_member_id IS NULL OR NEW.player_b_member_id IS NULL THEN RETURN NEW; END IF;

  v_loser := CASE WHEN NEW.winner_member_id = NEW.player_a_member_id
                  THEN NEW.player_b_member_id ELSE NEW.player_a_member_id END;

  SELECT t.club_id, t.ladder_affects INTO v_club_id, v_override
  FROM public.tournaments t WHERE t.id = NEW.champ_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(r.affects_ranking_points, true), COALESCE(r.ranking_weight, 1)
    INTO v_ranked, v_weight
  FROM public.tournament_rules r WHERE r.tournament_id = NEW.champ_id;

  IF COALESCE(v_ranked, true) IS TRUE THEN
    PERFORM public.award_ranking_points_for_result(
      v_club_id, NEW.winner_member_id, v_loser, 'tournament', NEW.id, COALESCE(v_weight,1)
    );
  END IF;

  SELECT COALESCE(lc.ladder_from_tournaments,true),
         COALESCE(lc.tournament_movement_policy, lc.movement_policy, 'insert')
    INTO v_enabled, v_move
  FROM public.ladder_configs lc WHERE lc.club_id = v_club_id;

  IF COALESCE(v_override, v_enabled, false) IS TRUE THEN
    PERFORM public.apply_ladder_result(v_club_id, NEW.winner_member_id, v_loser, COALESCE(v_move,'insert'));
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. League trigger honours the league's own ranking switch + weight
CREATE OR REPLACE FUNCTION public.award_points_for_league_rubber()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_winner uuid; v_loser uuid;
  v_wc uuid; v_lc uuid;
  v_enabled boolean; v_move text;
  v_ranked boolean; v_weight numeric;
BEGIN
  IF NEW.winner IS NULL OR NEW.winner NOT IN ('home','away') THEN RETURN NEW; END IF;
  IF NEW.home_player_member_id IS NULL OR NEW.away_player_member_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.winner IS NOT DISTINCT FROM NEW.winner
     AND OLD.home_player_member_id IS NOT DISTINCT FROM NEW.home_player_member_id
     AND OLD.away_player_member_id IS NOT DISTINCT FROM NEW.away_player_member_id THEN
    RETURN NEW;
  END IF;

  IF NEW.winner = 'home' THEN
    v_winner := NEW.home_player_member_id; v_loser := NEW.away_player_member_id;
  ELSE
    v_winner := NEW.away_player_member_id; v_loser := NEW.home_player_member_id;
  END IF;

  SELECT club_id INTO v_wc FROM public.club_members WHERE id = v_winner;
  SELECT club_id INTO v_lc FROM public.club_members WHERE id = v_loser;
  IF v_wc IS NULL OR v_wc IS DISTINCT FROM v_lc THEN RETURN NEW; END IF;

  SELECT COALESCE(bool_and(COALESCE(l.affects_ranking_points, true)), true),
         COALESCE(max(COALESCE(l.ranking_weight, 1)), 1)
    INTO v_ranked, v_weight
  FROM public.platform_league_fixtures f
  JOIN public.leagues l ON l.id IN (f.home_team_id, f.away_team_id)
  WHERE f.id = NEW.fixture_id;

  IF COALESCE(v_ranked, true) IS TRUE THEN
    PERFORM public.award_ranking_points_for_result(
      v_wc, v_winner, v_loser, 'league', NEW.id, COALESCE(v_weight,1));
  END IF;

  SELECT COALESCE(lc.ladder_from_leagues,true),
         COALESCE(lc.league_movement_policy, lc.movement_policy, 'insert')
    INTO v_enabled, v_move
  FROM public.ladder_configs lc WHERE lc.club_id = v_wc;

  IF COALESCE(v_enabled,false) IS TRUE THEN
    PERFORM public.apply_ladder_result(v_wc, v_winner, v_loser, COALESCE(v_move,'insert'));
  END IF;

  RETURN NEW;
END;
$function$;