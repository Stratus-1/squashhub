-- Re-saving a tournament from the builder sends only the columns the organiser touched.
-- `owner_org_id` is what the invitation audience and entry eligibility resolve from, so an
-- update that does not name a new owner must keep the stored one instead of clearing it.
CREATE OR REPLACE FUNCTION public.club_champs_compat_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.tournaments SET
    club_id = NEW.club_id, owner_org_id = COALESCE(NEW.owner_org_id, owner_org_id), name = NEW.name,
    gender = COALESCE(NULLIF(btrim(NEW.gender),''), gender),
    status = COALESCE(NULLIF(btrim(NEW.status),''), status),
    num_groups = NEW.num_groups,
    start_date = NEW.start_date, end_date = NEW.end_date, play_days = NEW.play_days,
    start_time = NEW.start_time, end_time = NEW.end_time,
    match_duration_minutes = NEW.match_duration_minutes,
    match_type = COALESCE(NULLIF(btrim(NEW.match_type),''), match_type),
    enable_playoffs = NEW.enable_playoffs, source_league_id = NEW.source_league_id,
    source_league_ids = NEW.source_league_ids,
    partner_mode = COALESCE(NULLIF(btrim(NEW.partner_mode),''), partner_mode),
    entries_locked = NEW.entries_locked, invite_methods = NEW.invite_methods,
    description = NEW.description, group_durations = NEW.group_durations,
    include_visitors = NEW.include_visitors, visitor_clubs = NEW.visitor_clubs,
    day_schedules = NEW.day_schedules, court_ids = NEW.court_ids,
    court_rotation_minutes = NEW.court_rotation_minutes,
    group_break_minutes = NEW.group_break_minutes,
    default_break_minutes = NEW.default_break_minutes,
    invite_source = COALESCE(NULLIF(btrim(NEW.invite_source),''), invite_source),
    invite_include_reserves = NEW.invite_include_reserves,
    invite_excluded_member_ids = NEW.invite_excluded_member_ids,
    group_labels = NEW.group_labels, swiss_pools = NEW.swiss_pools,
    swiss_rounds = NEW.swiss_rounds, avoid_back_to_back = NEW.avoid_back_to_back,
    schedule_mode = COALESCE(NULLIF(btrim(NEW.schedule_mode),''), schedule_mode),
    playoff_break_minutes = NEW.playoff_break_minutes,
    playoff_date = NEW.playoff_date, league_formats = NEW.league_formats,
    expected_players = NEW.expected_players, league_win_conditions = NEW.league_win_conditions,
    league_sections = COALESCE(NEW.league_sections, league_sections),
    knockout_seeds = NEW.knockout_seeds,
    knockout_seeds_at = NEW.knockout_seeds_at,
    invite_audience = COALESCE(NULLIF(btrim(NEW.invite_audience),''), invite_audience),
    invite_audience_league_ids = COALESCE(NEW.invite_audience_league_ids, invite_audience_league_ids), invite_audience_club_ids = COALESCE(NEW.invite_audience_club_ids, invite_audience_club_ids),
    invite_audience_member_ids = COALESCE(NEW.invite_audience_member_ids, invite_audience_member_ids),
    invite_audience_include_individuals = COALESCE(NEW.invite_audience_include_individuals, invite_audience_include_individuals),
    scheduling_mode = COALESCE(NULLIF(btrim(NEW.scheduling_mode),''), scheduling_mode),
    round_play_by = COALESCE(NEW.round_play_by, round_play_by),
    champion_scope = COALESCE(NULLIF(btrim(NEW.champion_scope),''), champion_scope),
    pool_sizes = COALESCE(NEW.pool_sizes, pool_sizes),
    pool_allocation = COALESCE(NEW.pool_allocation, pool_allocation)
  WHERE id = OLD.id;

  UPDATE public.tournament_governance SET
    sanction_status = COALESCE(NULLIF(btrim(NEW.sanction_status),''), sanction_status),
    sanctioning_org_id = NEW.sanctioning_org_id,
    sanction_reference = NEW.sanction_reference,
    sanction_notes = NEW.sanction_notes,
    competition_level = COALESCE(NULLIF(btrim(NEW.competition_level),''), competition_level),
    eligibility_min_age = COALESCE(NEW.eligibility_min_age, eligibility_min_age),
    eligibility_max_age = COALESCE(NEW.eligibility_max_age, eligibility_max_age),
    eligibility_requires_licence = COALESCE(NEW.eligibility_requires_licence, eligibility_requires_licence),
    eligibility_scope = COALESCE(NULLIF(btrim(NEW.eligibility_scope),''), eligibility_scope),
    eligibility_notes = NEW.eligibility_notes,
    registration_required = COALESCE(NEW.registration_required, registration_required),
    registration_mode = COALESCE(NEW.registration_mode, registration_mode),
    registration_opens_at = NEW.registration_opens_at,
    registration_closes_at = NEW.registration_closes_at,
    entry_fee_cents = COALESCE(NEW.entry_fee_cents, entry_fee_cents),
    federation_fee_cents = COALESCE(NEW.federation_fee_cents, federation_fee_cents),
    association_fee_cents = COALESCE(NEW.association_fee_cents, association_fee_cents),
    payment_methods = COALESCE(NEW.payment_methods, payment_methods),
    payment_required = COALESCE(NEW.payment_required, payment_required),
    refund_policy = COALESCE(NEW.refund_policy, refund_policy),
    refund_cutoff_date = NEW.refund_cutoff_date,
    entry_source = COALESCE(NULLIF(btrim(NEW.entry_source),''), entry_source),
    approval_gate = COALESCE(NULLIF(btrim(NEW.approval_gate),''), approval_gate),
    payment_timing = COALESCE(NULLIF(btrim(NEW.payment_timing),''), payment_timing)
  WHERE tournament_id = OLD.id;

  UPDATE public.tournament_rules SET
    scoring_mode = COALESCE(NULLIF(btrim(NEW.scoring_mode),''), scoring_mode),
    draw_type = COALESCE(NULLIF(btrim(NEW.draw_type),''), draw_type),
    standard_of_play = COALESCE(NULLIF(btrim(NEW.standard_of_play),''), standard_of_play),
    round_format = COALESCE(NULLIF(btrim(NEW.round_format),''), round_format),
    best_of = NEW.best_of,
    points_per_game = COALESCE(NEW.points_per_game, points_per_game),
    win_condition = COALESCE(NULLIF(btrim(NEW.win_condition),''), win_condition),
    handicap_mode = COALESCE(NULLIF(btrim(NEW.handicap_mode),''), handicap_mode),
    handicap_multiplier = NEW.handicap_multiplier, handicap_divider = NEW.handicap_divider,
    bye_handling = COALESCE(NULLIF(btrim(NEW.bye_handling),''), bye_handling),
    play_all_games = COALESCE(NEW.play_all_games, play_all_games),
    affects_ranking_points = COALESCE(NEW.affects_ranking_points, affects_ranking_points),
    no_show_opponent_points = COALESCE(NEW.no_show_opponent_points, no_show_opponent_points),
    no_show_player_points = COALESCE(NEW.no_show_player_points, no_show_player_points)
  WHERE tournament_id = OLD.id;

  RETURN NEW;
END;
$function$;
