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
    t.league_draw_styles, t.ladder_affects
   FROM public.tournaments t
     LEFT JOIN public.tournament_governance g ON g.tournament_id = t.id
     LEFT JOIN public.tournament_rules r ON r.tournament_id = t.id;

-- Late-firing INSTEAD OF triggers that persist the newest columns. They run
-- after the existing compat triggers (alphabetical order) and receive the row
-- those triggers returned, so the tournament id is always known.
CREATE OR REPLACE FUNCTION public.club_champs_compat_extra_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.tournaments SET
    league_draw_styles = COALESCE(NEW.league_draw_styles, league_draw_styles),
    ladder_affects = NEW.ladder_affects
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.club_champs_compat_extra_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.tournaments SET
    league_draw_styles = COALESCE(NEW.league_draw_styles, league_draw_styles),
    ladder_affects = NEW.ladder_affects
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_club_champs_compat_extra_insert ON public.club_champs;
CREATE TRIGGER zz_club_champs_compat_extra_insert
  INSTEAD OF INSERT ON public.club_champs
  FOR EACH ROW EXECUTE FUNCTION public.club_champs_compat_extra_insert();

DROP TRIGGER IF EXISTS zz_club_champs_compat_extra_update ON public.club_champs;
CREATE TRIGGER zz_club_champs_compat_extra_update
  INSTEAD OF UPDATE ON public.club_champs
  FOR EACH ROW EXECUTE FUNCTION public.club_champs_compat_extra_update();