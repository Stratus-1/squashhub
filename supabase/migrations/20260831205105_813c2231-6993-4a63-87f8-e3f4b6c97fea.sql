-- Expose tournaments.invite_extra_details via the club_champs compat view
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
    r.ranking_weight,
    t.invite_extra_details
   FROM tournaments t
     LEFT JOIN tournament_governance g ON g.tournament_id = t.id
     LEFT JOIN tournament_rules r ON r.tournament_id = t.id;

-- Carry invite_extra_details through the compat triggers
DO $do$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.club_champs_compat_insert'::regproc);
  src := replace(src,
    'pool_sizes, pool_allocation',
    'pool_sizes, pool_allocation, invite_extra_details');
  src := replace(src,
    'COALESCE(NULLIF(btrim(NEW.pool_allocation),''),''snake'')',
    'COALESCE(NULLIF(btrim(NEW.pool_allocation),''),''snake''), NEW.invite_extra_details');
  EXECUTE src;

  src := pg_get_functiondef('public.club_champs_compat_update'::regproc);
  src := replace(src,
    'pool_allocation = COALESCE(NULLIF(btrim(NEW.pool_allocation),''), pool_allocation)',
    'pool_allocation = COALESCE(NULLIF(btrim(NEW.pool_allocation),''), pool_allocation), invite_extra_details = NEW.invite_extra_details');
  EXECUTE src;
END
$do$;

NOTIFY pgrst, 'reload schema';