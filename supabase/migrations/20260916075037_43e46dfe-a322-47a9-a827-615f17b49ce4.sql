ALTER TABLE public.tournament_governance
  ADD COLUMN IF NOT EXISTS withdrawals_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS withdrawal_cutoff_days integer NOT NULL DEFAULT 2;

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
    t.league_draw_styles, t.ladder_affects, r.ranking_weight, t.invite_extra_details,
    t.invite_short_message, r.ranking_scope,
    g.withdrawals_allowed, g.withdrawal_cutoff_days
   FROM tournaments t
     LEFT JOIN tournament_governance g ON g.tournament_id = t.id
     LEFT JOIN tournament_rules r ON r.tournament_id = t.id;

CREATE OR REPLACE FUNCTION public.club_champs_compat_extra_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.tournaments SET
    league_draw_styles = COALESCE(NEW.league_draw_styles, league_draw_styles),
    ladder_affects = NEW.ladder_affects
  WHERE id = NEW.id;
  UPDATE public.tournament_rules SET
    ranking_weight = COALESCE(NEW.ranking_weight, ranking_weight),
    ranking_scope = NEW.ranking_scope
  WHERE tournament_id = NEW.id;
  UPDATE public.tournament_governance SET
    withdrawals_allowed = COALESCE(NEW.withdrawals_allowed, withdrawals_allowed),
    withdrawal_cutoff_days = COALESCE(NEW.withdrawal_cutoff_days, withdrawal_cutoff_days)
  WHERE tournament_id = NEW.id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.club_champs_compat_extra_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.tournaments SET
    league_draw_styles = COALESCE(NEW.league_draw_styles, league_draw_styles),
    ladder_affects = NEW.ladder_affects
  WHERE id = OLD.id;
  UPDATE public.tournament_rules SET
    ranking_weight = COALESCE(NEW.ranking_weight, ranking_weight),
    ranking_scope = NEW.ranking_scope
  WHERE tournament_id = OLD.id;
  UPDATE public.tournament_governance SET
    withdrawals_allowed = COALESCE(NEW.withdrawals_allowed, withdrawals_allowed),
    withdrawal_cutoff_days = COALESCE(NEW.withdrawal_cutoff_days, withdrawal_cutoff_days)
  WHERE tournament_id = OLD.id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tournament_withdrawal_deadline(
  p_start_date date,
  p_cutoff_days integer
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN p_start_date IS NULL THEN NULL
    ELSE (p_start_date::timestamptz - make_interval(days => GREATEST(0, COALESCE(p_cutoff_days, 0))))
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.withdraw_tournament_entry_public(
  p_token text,
  p_verify text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reg record;
  v_champ record;
  v_member record;
  v_deadline timestamptz;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;

  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;

  SELECT id, name, user_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;

  IF NOT (auth.uid() IS NOT NULL AND v_member.user_id IS NOT NULL AND auth.uid() = v_member.user_id) THEN
    IF NOT public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
      RAISE EXCEPTION 'We could not verify that this invitation is yours. Please check the detail you entered.';
    END IF;
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;

  IF lower(COALESCE(v_reg.status, '')) = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled', 'champ_id', v_reg.champ_id, 'already', true);
  END IF;

  IF NOT COALESCE(v_champ.withdrawals_allowed, true) THEN
    RAISE EXCEPTION 'This tournament does not allow players to withdraw themselves. Please contact the organiser.';
  END IF;

  v_deadline := public.tournament_withdrawal_deadline(v_champ.start_date, v_champ.withdrawal_cutoff_days);
  IF v_deadline IS NOT NULL AND now() > v_deadline THEN
    RAISE EXCEPTION 'Withdrawals for this tournament closed on %. Please contact the organiser.', to_char(v_deadline, 'DD Mon YYYY');
  END IF;

  UPDATE public.club_champs_registrations
     SET status = 'cancelled',
         confirmed_at = NULL,
         confirmed_by = NULL,
         confirmation_source = 'withdrawn',
         declined_at = now(),
         invite_viewed_at = COALESCE(invite_viewed_at, now())
   WHERE id = v_reg.id;

  DELETE FROM public.club_champs_entries
   WHERE champ_id = v_reg.champ_id AND club_member_id = v_reg.club_member_id;

  UPDATE public.champ_doubles_pairs
     SET status = 'cancelled', responded_at = now(), updated_at = now()
   WHERE champ_id = v_reg.champ_id
     AND (member_a = v_reg.club_member_id OR member_b = v_reg.club_member_id)
     AND COALESCE(status, '') <> 'cancelled';

  RETURN jsonb_build_object('status', 'cancelled', 'champ_id', v_reg.champ_id, 'registration_id', v_reg.id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.withdraw_tournament_entry_public(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_tournament_entry_public(text, text) TO anon, authenticated, service_role;