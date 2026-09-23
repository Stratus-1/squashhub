ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS result_notify_scope text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS result_notify_channels text[] NOT NULL DEFAULT ARRAY['email']::text[],
  ADD COLUMN IF NOT EXISTS result_notify_include_forfeits boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.validate_result_notify_settings()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.result_notify_scope NOT IN ('all','playoffs','never') THEN
    RAISE EXCEPTION 'Invalid result_notify_scope %', NEW.result_notify_scope;
  END IF;
  IF NOT (NEW.result_notify_channels <@ ARRAY['email','in_app','whatsapp','sms']::text[]) THEN
    RAISE EXCEPTION 'Invalid result_notify_channels';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_result_notify_settings ON public.tournaments;
CREATE TRIGGER trg_validate_result_notify_settings BEFORE INSERT OR UPDATE OF result_notify_scope, result_notify_channels
  ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.validate_result_notify_settings();

CREATE TABLE IF NOT EXISTS public.champ_result_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  champ_id uuid NOT NULL,
  match_id uuid,
  result_key text NOT NULL,
  club_member_id uuid NOT NULL,
  channel text NOT NULL,
  won boolean,
  result_stage text,
  subject text,
  body text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  attempts integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (result_key, club_member_id, channel)
);
GRANT SELECT ON public.champ_result_notifications TO authenticated;
GRANT ALL ON public.champ_result_notifications TO service_role;
ALTER TABLE public.champ_result_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins can view result notifications" ON public.champ_result_notifications
  FOR SELECT TO authenticated USING (public.is_club_admin(auth.uid(), club_id));
CREATE INDEX IF NOT EXISTS idx_champ_result_notifications_pending
  ON public.champ_result_notifications (channel, created_at) WHERE status = 'pending';
CREATE TRIGGER update_champ_result_notifications_updated_at BEFORE UPDATE ON public.champ_result_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.champ_result_notifications (club_id, champ_id, match_id, result_key, club_member_id, channel, status, error, processed_at)
SELECT t.club_id, m.champ_id, m.id,
  md5(concat_ws('|', m.champ_id::text, COALESCE(m.stage,''), COALESCE(m.stage_label,''),
    COALESCE(m.round_number::text,''), COALESCE(m.scheduled_date::text,''), COALESCE(m.scheduled_time::text,''),
    (SELECT string_agg(x::text, ',' ORDER BY x::text) FROM unnest(ARRAY[m.player_a_member_id, m.partner_a_member_id,
       m.player_b_member_id, m.partner_b_member_id]) x WHERE x IS NOT NULL),
    m.winner_member_id::text)),
  p.member_id, ch, 'skipped', 'backfilled', now()
FROM public.club_champs_matches m
JOIN public.tournaments t ON t.id = m.champ_id
CROSS JOIN LATERAL unnest(ARRAY[m.player_a_member_id, m.partner_a_member_id, m.player_b_member_id, m.partner_b_member_id]) AS p(member_id)
CROSS JOIN unnest(ARRAY['email','in_app','whatsapp','sms']) AS ch
WHERE m.status = 'completed' AND m.winner_member_id IS NOT NULL AND NOT COALESCE(m.is_bye, false)
  AND p.member_id IS NOT NULL AND t.club_id IS NOT NULL
ON CONFLICT DO NOTHING;

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
    t.league_draw_styles, t.ladder_affects, r.ranking_weight,
    t.invite_extra_details, t.invite_short_message, r.ranking_scope,
    g.withdrawals_allowed, g.withdrawal_cutoff_days, t.round_definitions,
    t.milestone_play_by, t.division_follows, t.division_pairing_method,
    t.pool_durations, t.division_seed_source,
    t.league_playoff_modes, t.league_playoff_qualifiers, t.rotation_max_matches,
    t.swiss_pairing_modes, t.swiss_knockout_qualifiers, t.rotation_avoid_pairs,
    t.rotation_strength_mode, t.result_notify_scope, t.result_notify_channels, t.result_notify_include_forfeits
   FROM tournaments t
     LEFT JOIN tournament_governance g ON g.tournament_id = t.id
     LEFT JOIN tournament_rules r ON r.tournament_id = t.id;

CREATE OR REPLACE FUNCTION public.club_champs_compat_structure_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tournaments SET
    league_playoff_modes = NEW.league_playoff_modes,
    league_playoff_qualifiers = NEW.league_playoff_qualifiers,
    rotation_max_matches = NEW.rotation_max_matches,
    rotation_avoid_pairs = NEW.rotation_avoid_pairs,
    rotation_strength_mode = NEW.rotation_strength_mode,
    result_notify_scope = COALESCE(NEW.result_notify_scope, 'all'),
    result_notify_channels = COALESCE(NEW.result_notify_channels, ARRAY['email']::text[]),
    result_notify_include_forfeits = COALESCE(NEW.result_notify_include_forfeits, false),
    swiss_pairing_modes = NEW.swiss_pairing_modes,
    swiss_knockout_qualifiers = NEW.swiss_knockout_qualifiers
  WHERE id = COALESCE(OLD.id, NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_club_champs_structure_insert ON public.club_champs;
DROP TRIGGER IF EXISTS zzz_club_champs_structure_update ON public.club_champs;
CREATE TRIGGER zzz_club_champs_structure_insert INSTEAD OF INSERT ON public.club_champs
  FOR EACH ROW EXECUTE FUNCTION public.club_champs_compat_structure_write();
CREATE TRIGGER zzz_club_champs_structure_update INSTEAD OF UPDATE ON public.club_champs
  FOR EACH ROW EXECUTE FUNCTION public.club_champs_compat_structure_write();

CREATE OR REPLACE FUNCTION public.queue_champ_result_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id uuid;
  v_club_name text;
  v_enabled boolean;
  v_champ_name text;
  v_score text;
  v_winners uuid[];
  v_losers uuid[];
  v_result_stage text;
  v_is_doubles boolean;
  m record;
  v_body text;
  v_subject text;
  v_notify_scope text;
  v_channels text[];
  v_include_forfeits boolean;
  v_key text;
  v_ch text;
  v_event_id uuid;
BEGIN
  IF NEW.is_bye THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status, '') <> 'completed' THEN RETURN NEW; END IF;
  IF NEW.winner_member_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.status, '') = 'completed'
     AND COALESCE(OLD.winner_member_id::text, '') = COALESCE(NEW.winner_member_id::text, '') THEN
    RETURN NEW;
  END IF;

  SELECT t.club_id, t.name,
         COALESCE(t.result_notify_scope, 'all'),
         COALESCE(t.result_notify_channels, ARRAY['email']::text[]),
         COALESCE(t.result_notify_include_forfeits, false)
    INTO v_club_id, v_champ_name, v_notify_scope, v_channels, v_include_forfeits
    FROM public.tournaments t WHERE t.id = NEW.champ_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;
  IF v_notify_scope = 'never' OR COALESCE(array_length(v_channels, 1), 0) = 0 THEN RETURN NEW; END IF;

  IF NOT v_include_forfeits AND (
       NEW.forfeit_member_id IS NOT NULL
       OR COALESCE(NEW.score, '') ILIKE '%w/o%'
       OR COALESCE(NEW.score, '') ILIKE '%walkover%'
       OR COALESCE(NEW.score, '') ILIKE '%forfeit%'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT c.name, COALESCE(c.champ_result_emails, true) INTO v_club_name, v_enabled
    FROM public.clubs c WHERE c.id = v_club_id;

  IF NEW.winner_member_id IN (NEW.player_a_member_id, NEW.partner_a_member_id) THEN
    v_winners := ARRAY[NEW.player_a_member_id, NEW.partner_a_member_id];
    v_losers  := ARRAY[NEW.player_b_member_id, NEW.partner_b_member_id];
  ELSE
    v_winners := ARRAY[NEW.player_b_member_id, NEW.partner_b_member_id];
    v_losers  := ARRAY[NEW.player_a_member_id, NEW.partner_a_member_id];
  END IF;

  v_score := NULLIF(trim(COALESCE(NEW.score, '')), '');
  v_result_stage := public.classify_champ_result_stage(NEW.id);
  v_is_doubles := NEW.partner_a_member_id IS NOT NULL OR NEW.partner_b_member_id IS NOT NULL;
  IF v_notify_scope = 'playoffs' AND v_result_stage = 'ordinary' THEN RETURN NEW; END IF;

  v_key := md5(concat_ws('|', NEW.champ_id::text, COALESCE(NEW.stage,''), COALESCE(NEW.stage_label,''),
    COALESCE(NEW.round_number::text,''), COALESCE(NEW.scheduled_date::text,''), COALESCE(NEW.scheduled_time::text,''),
    (SELECT string_agg(x::text, ',' ORDER BY x::text) FROM unnest(ARRAY[NEW.player_a_member_id, NEW.partner_a_member_id,
       NEW.player_b_member_id, NEW.partner_b_member_id]) x WHERE x IS NOT NULL),
    NEW.winner_member_id::text));

  FOR m IN
    SELECT cm.id, cm.name, cm.email, cm.user_id, x.won
      FROM (
        SELECT unnest(v_winners) AS member_id, true AS won
        UNION ALL
        SELECT unnest(v_losers), false
      ) x
      JOIN public.club_members cm ON cm.id = x.member_id
  LOOP
    IF m.won THEN
      CASE v_result_stage
        WHEN 'quarter_final' THEN
          v_subject := 'Well done, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — you are through to the semi-final';
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nWell done on your quarter-final win in '
            || COALESCE(v_champ_name, 'the championship') || '!'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || E'\n\nYou are through to the semi-final. Keep the racquet warm and enjoy the win.';
        WHEN 'semi_final' THEN
          v_subject := 'Well done, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — you are through to the final';
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nWell done on your semi-final win in '
            || COALESCE(v_champ_name, 'the championship') || '!'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || E'\n\nYou are through to the final. One more match to go — well played.';
        WHEN 'title_final' THEN
          v_subject := 'Congratulations, ' || split_part(COALESCE(m.name, 'champion'), ' ', 1) || ' — you are a champion of ' || COALESCE(v_champ_name, 'the championship');
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nCongratulations on winning the final of '
            || COALESCE(v_champ_name, 'the championship') || '!'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || CASE WHEN v_is_doubles THEN E'\n\nYou and your partner are champions. A fantastic team performance from start to finish.'
                    ELSE E'\n\nYou are a champion. A fantastic achievement from start to finish.' END;
        WHEN 'third_place' THEN
          v_subject := 'Well played, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — you won the third-place play-off';
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nWell done on winning the third-place play-off in '
            || COALESCE(v_champ_name, 'the championship') || '.'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || E'\n\nA strong finish to your tournament — congratulations.';
        WHEN 'placement_final' THEN
          v_subject := 'Well played, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — you won your placement final';
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nWell done on winning your placement final in '
            || COALESCE(v_champ_name, 'the championship') || '.'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || E'\n\nA strong finish — congratulations.';
        WHEN 'early_knockout' THEN
          v_subject := 'Well played, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — you won your ' || COALESCE(v_champ_name, 'championship') || ' match';
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nCongratulations on your knockout win in '
            || COALESCE(v_champ_name, 'the championship') || '!'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || E'\n\nYour tournament continues. Well played, and good luck for your next match.';
        ELSE
          v_subject := 'Well played, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — you won your ' || COALESCE(v_champ_name, 'tournament') || ' match';
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nCongratulations on your win in '
            || COALESCE(v_champ_name, 'the tournament') || '!'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || E'\n\nWell played, and thank you for taking part.';
      END CASE;
    ELSE
      CASE v_result_stage
        WHEN 'quarter_final' THEN
          v_subject := 'Hard luck, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — quarter-final in ' || COALESCE(v_champ_name, 'the championship');
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nHard luck in your quarter-final in '
            || COALESCE(v_champ_name, 'the championship') || '.'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || E'\n\nReaching the quarter-final is an achievement. Thank you for a great effort.';
        WHEN 'semi_final' THEN
          v_subject := 'Hard luck, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — semi-final in ' || COALESCE(v_champ_name, 'the championship');
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nHard luck in your semi-final in '
            || COALESCE(v_champ_name, 'the championship') || '.'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || E'\n\nYou came very close to the final. Thank you for a strong tournament and a great effort.';
        WHEN 'title_final' THEN
          v_subject := 'Well played, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — runner-up in ' || COALESCE(v_champ_name, 'the championship');
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nWell played in the final of '
            || COALESCE(v_champ_name, 'the championship') || '.'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || CASE WHEN v_is_doubles THEN E'\n\nYou and your partner are the runners-up. Reaching the final is a superb achievement — thank you for a memorable tournament.'
                    ELSE E'\n\nYou are the runner-up. Reaching the final is a superb achievement — thank you for a memorable tournament.' END;
        WHEN 'third_place' THEN
          v_subject := 'Well played, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — third-place play-off';
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nWell played in the third-place play-off in '
            || COALESCE(v_champ_name, 'the championship') || '.'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || E'\n\nThank you for a strong tournament and a great effort.';
        WHEN 'placement_final' THEN
          v_subject := 'Well played, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — placement final';
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nWell played in your placement final in '
            || COALESCE(v_champ_name, 'the championship') || '.'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || E'\n\nThank you for a strong tournament and a great effort.';
        ELSE
          v_subject := 'Hard luck, ' || split_part(COALESCE(m.name, 'player'), ' ', 1) || ' — great effort in ' || COALESCE(v_champ_name, 'the tournament');
          v_body := 'Hi ' || COALESCE(m.name, 'there') || E',\n\nTough one today in '
            || COALESCE(v_champ_name, 'the tournament') || '.'
            || CASE WHEN v_score IS NOT NULL THEN ' Final score: ' || v_score || '.' ELSE '' END
            || CASE WHEN v_result_stage = 'early_knockout'
                    THEN E'\n\nThank you for stepping on court and giving it everything. Well played, and thank you for being part of the tournament.'
                    ELSE E'\n\nThank you for stepping on court and giving it everything. There may still be more matches to play, so keep going.' END;
      END CASE;
    END IF;

    v_body := v_body || E'\n\n' || COALESCE(v_club_name, 'Your club');

    FOREACH v_ch IN ARRAY v_channels LOOP
      IF v_ch NOT IN ('email','in_app','whatsapp','sms') THEN CONTINUE; END IF;
      v_event_id := NULL;
      INSERT INTO public.champ_result_notifications
        (club_id, champ_id, match_id, result_key, club_member_id, channel, won, result_stage, subject, body, status)
      VALUES (v_club_id, NEW.champ_id, NEW.id, v_key, m.id, v_ch, m.won, v_result_stage, v_subject, v_body, 'pending')
      ON CONFLICT (result_key, club_member_id, channel) DO NOTHING
      RETURNING id INTO v_event_id;
      IF v_event_id IS NULL THEN CONTINUE; END IF;

      IF v_ch = 'email' THEN
        IF NOT COALESCE(v_enabled, true) OR m.email IS NULL OR length(trim(m.email)) <= 3 THEN
          UPDATE public.champ_result_notifications SET status = 'skipped', processed_at = now(),
            error = CASE WHEN NOT COALESCE(v_enabled, true) THEN 'club result emails off' ELSE 'no email' END
           WHERE id = v_event_id;
        ELSIF EXISTS (SELECT 1 FROM public.email_outbox eo WHERE eo.ref_id = NEW.id AND eo.kind = 'champ_result' AND eo.club_member_id = m.id) THEN
          UPDATE public.champ_result_notifications SET status = 'skipped', processed_at = now(), error = 'already emailed' WHERE id = v_event_id;
        ELSE
          INSERT INTO public.email_outbox (club_id, club_member_id, recipient_email, recipient_name, subject, body, kind, ref_id)
          VALUES (v_club_id, m.id, trim(m.email), m.name, v_subject, v_body, 'champ_result', NEW.id);
          UPDATE public.champ_result_notifications SET status = 'queued', processed_at = now() WHERE id = v_event_id;
        END IF;
      ELSIF v_ch = 'in_app' THEN
        IF m.user_id IS NULL THEN
          UPDATE public.champ_result_notifications SET status = 'skipped', processed_at = now(), error = 'no app account' WHERE id = v_event_id;
        ELSE
          INSERT INTO public.notifications (user_id, type, title, message, url, data)
          VALUES (m.user_id, 'champ_result', v_subject, v_body, '/tournaments?tournamentId=' || NEW.champ_id::text,
                  jsonb_build_object('champ_id', NEW.champ_id, 'match_id', NEW.id, 'club_member_id', m.id));
          UPDATE public.champ_result_notifications SET status = 'sent', processed_at = now() WHERE id = v_event_id;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_champ_result_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_champ_result_emails() TO service_role;

DROP TRIGGER IF EXISTS trg_queue_champ_result_emails ON public.club_champs_matches;
CREATE TRIGGER trg_queue_champ_result_emails
  AFTER INSERT OR UPDATE OF status, winner_member_id, score ON public.club_champs_matches
  FOR EACH ROW EXECUTE FUNCTION public.queue_champ_result_emails();