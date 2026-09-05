CREATE OR REPLACE FUNCTION public.club_champs_compat_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.tournaments (
    id, club_id, owner_org_id, name, gender, status, num_groups, start_date, end_date,
    play_days, start_time, end_time, match_duration_minutes, match_type, enable_playoffs,
    source_league_id, source_league_ids, partner_mode, entries_locked, invite_methods,
    description, group_durations, include_visitors, visitor_clubs, day_schedules,
    court_ids, court_rotation_minutes, group_break_minutes, default_break_minutes,
    invite_source, invite_include_reserves, invite_excluded_member_ids, group_labels,
    swiss_pools, swiss_rounds, avoid_back_to_back, schedule_mode, playoff_break_minutes,
    playoff_date, league_formats, expected_players, league_win_conditions,
    league_sections, knockout_seeds, knockout_seeds_at,
    invite_audience, invite_audience_league_ids, invite_audience_club_ids, invite_audience_member_ids,
    invite_audience_include_individuals, scheduling_mode, round_play_by, champion_scope,
    pool_sizes, pool_allocation, invite_extra_details
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.club_id,
    COALESCE(NEW.owner_org_id, (SELECT o.id FROM public.organisations o WHERE o.club_id = NEW.club_id)),
    NEW.name, COALESCE(NULLIF(btrim(NEW.gender),''),'men'), COALESCE(NULLIF(btrim(NEW.status),''),'planning'), COALESCE(NEW.num_groups,2),
    NEW.start_date, NEW.end_date, COALESCE(NEW.play_days,'{}'), COALESCE(NEW.start_time,'18:00'),
    COALESCE(NEW.end_time,'20:00'), COALESCE(NEW.match_duration_minutes,30),
    COALESCE(NULLIF(btrim(NEW.match_type),''),'singles'), COALESCE(NEW.enable_playoffs,false),
    NEW.source_league_id, COALESCE(NEW.source_league_ids,'{}'), COALESCE(NULLIF(btrim(NEW.partner_mode),''),'admin'),
    COALESCE(NEW.entries_locked,false), COALESCE(NEW.invite_methods, ARRAY['app'::text]),
    NEW.description, COALESCE(NEW.group_durations,'{}'::jsonb), COALESCE(NEW.include_visitors,false),
    COALESCE(NEW.visitor_clubs,'{}'), COALESCE(NEW.day_schedules,'[]'::jsonb),
    COALESCE(NEW.court_ids,'{}'), NEW.court_rotation_minutes,
    COALESCE(NEW.group_break_minutes,'{}'::jsonb), COALESCE(NEW.default_break_minutes,0),
    COALESCE(NULLIF(btrim(NEW.invite_source),''),'manual'), COALESCE(NEW.invite_include_reserves,true),
    COALESCE(NEW.invite_excluded_member_ids,'{}'), NEW.group_labels, NEW.swiss_pools,
    NEW.swiss_rounds, COALESCE(NEW.avoid_back_to_back,true), COALESCE(NULLIF(btrim(NEW.schedule_mode),''),'spread'),
    COALESCE(NEW.playoff_break_minutes,0), NEW.playoff_date, NEW.league_formats, NEW.expected_players,
    COALESCE(NEW.league_win_conditions,'{}'::jsonb),
    COALESCE(NEW.league_sections,'{}'::jsonb), NEW.knockout_seeds, NEW.knockout_seeds_at,
    COALESCE(NULLIF(btrim(NEW.invite_audience),''),'all_club'),
    COALESCE(NEW.invite_audience_league_ids,'{}'), COALESCE(NEW.invite_audience_club_ids,'{}'),
    COALESCE(NEW.invite_audience_member_ids,'{}'),
    COALESCE(NEW.invite_audience_include_individuals,false),
    COALESCE(NULLIF(btrim(NEW.scheduling_mode),''),'club'),
    COALESCE(NEW.round_play_by,'{}'::jsonb),
    COALESCE(NULLIF(btrim(NEW.champion_scope),''),'division'),
    COALESCE(NEW.pool_sizes,'{}'::jsonb),
    COALESCE(NULLIF(btrim(NEW.pool_allocation),''),'snake'),
    NEW.invite_extra_details
  ) RETURNING id INTO new_id;

  UPDATE public.tournament_governance SET
    sanction_status = COALESCE(NULLIF(btrim(NEW.sanction_status),''), sanction_status),
    sanctioning_org_id = COALESCE(NEW.sanctioning_org_id, sanctioning_org_id),
    sanction_reference = COALESCE(NEW.sanction_reference, sanction_reference),
    sanction_notes = COALESCE(NEW.sanction_notes, sanction_notes),
    competition_level = COALESCE(NULLIF(btrim(NEW.competition_level),''), competition_level),
    eligibility_min_age = COALESCE(NEW.eligibility_min_age, eligibility_min_age),
    eligibility_max_age = COALESCE(NEW.eligibility_max_age, eligibility_max_age),
    eligibility_requires_licence = COALESCE(NEW.eligibility_requires_licence, eligibility_requires_licence),
    eligibility_scope = COALESCE(NULLIF(btrim(NEW.eligibility_scope),''), eligibility_scope),
    eligibility_notes = COALESCE(NEW.eligibility_notes, eligibility_notes),
    registration_required = COALESCE(NEW.registration_required, registration_required),
    registration_mode = COALESCE(NULLIF(btrim(NEW.registration_mode),''), registration_mode),
    registration_opens_at = COALESCE(NEW.registration_opens_at, registration_opens_at),
    registration_closes_at = COALESCE(NEW.registration_closes_at, registration_closes_at),
    entry_fee_cents = COALESCE(NEW.entry_fee_cents, entry_fee_cents),
    federation_fee_cents = COALESCE(NEW.federation_fee_cents, federation_fee_cents),
    association_fee_cents = COALESCE(NEW.association_fee_cents, association_fee_cents),
    payment_methods = COALESCE(NEW.payment_methods, payment_methods),
    payment_required = COALESCE(NEW.payment_required, payment_required),
    refund_policy = COALESCE(NEW.refund_policy, refund_policy),
    refund_cutoff_date = COALESCE(NEW.refund_cutoff_date, refund_cutoff_date),
    entry_source = COALESCE(NULLIF(btrim(NEW.entry_source),''), entry_source),
    approval_gate = COALESCE(NULLIF(btrim(NEW.approval_gate),''), approval_gate),
    payment_timing = COALESCE(NULLIF(btrim(NEW.payment_timing),''), payment_timing)
  WHERE tournament_id = new_id;

  UPDATE public.tournament_rules SET
    scoring_mode = COALESCE(NULLIF(btrim(NEW.scoring_mode),''), scoring_mode),
    draw_type = COALESCE(NULLIF(btrim(NEW.draw_type),''), draw_type),
    standard_of_play = COALESCE(NULLIF(btrim(NEW.standard_of_play),''), standard_of_play),
    round_format = COALESCE(NULLIF(btrim(NEW.round_format),''), round_format),
    best_of = COALESCE(NEW.best_of, best_of),
    points_per_game = COALESCE(NEW.points_per_game, points_per_game),
    win_condition = COALESCE(NULLIF(btrim(NEW.win_condition),''), win_condition),
    handicap_mode = COALESCE(NULLIF(btrim(NEW.handicap_mode),''), handicap_mode),
    handicap_multiplier = COALESCE(NEW.handicap_multiplier, handicap_multiplier),
    handicap_divider = COALESCE(NEW.handicap_divider, handicap_divider),
    bye_handling = COALESCE(NULLIF(btrim(NEW.bye_handling),''), bye_handling),
    play_all_games = COALESCE(NEW.play_all_games, play_all_games),
    affects_ranking_points = COALESCE(NEW.affects_ranking_points, affects_ranking_points),
    no_show_opponent_points = COALESCE(NEW.no_show_opponent_points, no_show_opponent_points),
    no_show_player_points = COALESCE(NEW.no_show_player_points, no_show_player_points)
  WHERE tournament_id = new_id;

  SELECT * INTO NEW FROM public.club_champs WHERE id = new_id;
  RETURN NEW;
END;
$function$;