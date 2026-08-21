-- 1. Tournament-level scheduling mode + play-by windows
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS scheduling_mode text NOT NULL DEFAULT 'club',
  ADD COLUMN IF NOT EXISTS round_play_by jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_scheduling_mode_check;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_scheduling_mode_check CHECK (scheduling_mode IN ('club','self'));

-- 2. Registration division choices
ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS division_choices integer[] NOT NULL DEFAULT '{}';

-- 3. Matches can carry a play-by deadline
ALTER TABLE public.club_champs_matches
  ADD COLUMN IF NOT EXISTS play_by date;

-- 4. Allow one entry per division per player
ALTER TABLE public.club_champs_entries
  DROP CONSTRAINT IF EXISTS club_champs_entries_champ_id_club_member_id_key;
ALTER TABLE public.club_champs_entries
  ALTER COLUMN group_number SET DEFAULT 1;
UPDATE public.club_champs_entries SET group_number = 1 WHERE group_number IS NULL;
ALTER TABLE public.club_champs_entries
  ALTER COLUMN group_number SET NOT NULL;
ALTER TABLE public.club_champs_entries
  DROP CONSTRAINT IF EXISTS club_champs_entries_champ_member_group_key;
ALTER TABLE public.club_champs_entries
  ADD CONSTRAINT club_champs_entries_champ_member_group_key
  UNIQUE (champ_id, club_member_id, group_number);

-- 5. Expose the new tournament columns through the club_champs view
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
  t.league_sections, t.knockout_seeds, t.knockout_seeds_at,
  t.invite_audience, t.invite_audience_league_ids, t.invite_audience_member_ids,
  t.invite_audience_include_individuals,
  t.scheduling_mode, t.round_play_by
FROM public.tournaments t
  LEFT JOIN public.tournament_governance g ON g.tournament_id = t.id
  LEFT JOIN public.tournament_rules r ON r.tournament_id = t.id;

-- 6. Compat triggers must carry the new columns
CREATE OR REPLACE FUNCTION public.club_champs_compat_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.tournaments SET
    club_id = NEW.club_id, owner_org_id = NEW.owner_org_id, name = NEW.name,
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
    invite_audience_league_ids = COALESCE(NEW.invite_audience_league_ids, invite_audience_league_ids),
    invite_audience_member_ids = COALESCE(NEW.invite_audience_member_ids, invite_audience_member_ids),
    invite_audience_include_individuals = COALESCE(NEW.invite_audience_include_individuals, invite_audience_include_individuals),
    scheduling_mode = COALESCE(NULLIF(btrim(NEW.scheduling_mode),''), scheduling_mode),
    round_play_by = COALESCE(NEW.round_play_by, round_play_by)
  WHERE id = OLD.id;

  UPDATE public.tournament_governance SET
    sanction_status = COALESCE(NULLIF(btrim(NEW.sanction_status),''), sanction_status),
    sanctioning_org_id = NEW.sanctioning_org_id,
    sanction_reference = NEW.sanction_reference,
    sanction_notes = NEW.sanction_notes,
    competition_level = COALESCE(NULLIF(btrim(NEW.competition_level),''), competition_level),
    eligibility_min_age = NEW.eligibility_min_age,
    eligibility_max_age = NEW.eligibility_max_age,
    eligibility_requires_licence = COALESCE(NEW.eligibility_requires_licence, eligibility_requires_licence),
    eligibility_scope = COALESCE(NULLIF(btrim(NEW.eligibility_scope),''), eligibility_scope),
    eligibility_notes = NEW.eligibility_notes,
    registration_required = COALESCE(NEW.registration_required, registration_required),
    registration_mode = COALESCE(NULLIF(btrim(NEW.registration_mode),''), registration_mode),
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
    handicap_multiplier = COALESCE(NEW.handicap_multiplier, handicap_multiplier),
    handicap_divider = COALESCE(NEW.handicap_divider, handicap_divider),
    bye_handling = COALESCE(NULLIF(btrim(NEW.bye_handling),''), bye_handling),
    play_all_games = COALESCE(NEW.play_all_games, play_all_games),
    affects_ranking_points = COALESCE(NEW.affects_ranking_points, affects_ranking_points),
    no_show_opponent_points = COALESCE(NEW.no_show_opponent_points, no_show_opponent_points),
    no_show_player_points = COALESCE(NEW.no_show_player_points, no_show_player_points)
  WHERE tournament_id = OLD.id;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.club_champs_compat_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
    invite_audience, invite_audience_league_ids, invite_audience_member_ids,
    invite_audience_include_individuals, scheduling_mode, round_play_by
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
    COALESCE(NEW.invite_audience_league_ids,'{}'),
    COALESCE(NEW.invite_audience_member_ids,'{}'),
    COALESCE(NEW.invite_audience_include_individuals,false),
    COALESCE(NULLIF(btrim(NEW.scheduling_mode),''),'club'),
    COALESCE(NEW.round_play_by,'{}'::jsonb)
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
$fn$;