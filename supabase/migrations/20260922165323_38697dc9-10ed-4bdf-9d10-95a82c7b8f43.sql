CREATE OR REPLACE FUNCTION public.classify_champ_result_stage(p_match_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_match public.club_champs_matches%ROWTYPE;
  v_scope text := 'division';
  v_label text;
  v_stage text;
  v_section_count integer := 0;
  v_has_league_final boolean := false;
BEGIN
  SELECT m.* INTO v_match
  FROM public.club_champs_matches m
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN RETURN 'ordinary'; END IF;

  SELECT COALESCE(t.champion_scope, 'division')
    INTO v_scope
  FROM public.tournaments t
  WHERE t.id = v_match.champ_id;

  v_label := lower(COALESCE(v_match.stage_label, ''));
  v_stage := lower(COALESCE(v_match.stage, ''));

  IF v_stage IN ('group', 'pool', 'league', '') THEN RETURN 'ordinary'; END IF;
  IF v_stage = 'playoff_3rd' OR v_label ~ '(3rd|third)[[:space:]-]*place' THEN RETURN 'third_place'; END IF;
  IF v_label LIKE '%quarter-final%' OR v_label LIKE '%quarter final%' OR v_stage = 'playoff_qf' THEN RETURN 'quarter_final'; END IF;
  IF v_label LIKE '%semi-final%' OR v_label LIKE '%semi final%' OR v_stage = 'playoff_sf' THEN RETURN 'semi_final'; END IF;

  IF v_label LIKE '%final%' OR v_stage = 'playoff_final' THEN
    IF v_label ~ '(pos|position)[[:space:]]*[2-9]' THEN RETURN 'placement_final'; END IF;

    IF v_scope = 'pool' THEN RETURN 'title_final'; END IF;
    IF COALESCE(v_match.section_number, 0) = 0 THEN RETURN 'title_final'; END IF;
    IF v_label LIKE '%league final%' THEN RETURN 'title_final'; END IF;

    SELECT
      count(DISTINCT NULLIF(m.section_number, 0)) FILTER (WHERE COALESCE(m.section_number, 0) > 0),
      EXISTS (
        SELECT 1
        FROM public.club_champs_matches f
        WHERE f.champ_id = v_match.champ_id
          AND f.group_number = v_match.group_number
          AND COALESCE(f.section_number, 0) = 0
          AND f.id <> v_match.id
          AND (
            lower(COALESCE(f.stage, '')) LIKE 'ko%'
            OR lower(COALESCE(f.stage, '')) LIKE 'playoff%'
          )
      )
    INTO v_section_count, v_has_league_final
    FROM public.club_champs_matches m
    WHERE m.champ_id = v_match.champ_id
      AND m.group_number = v_match.group_number;

    IF v_section_count <= 1 AND NOT v_has_league_final THEN RETURN 'title_final'; END IF;
    RETURN 'semi_final';
  END IF;

  IF v_stage LIKE 'ko%' OR v_stage LIKE 'playoff%' THEN RETURN 'early_knockout'; END IF;
  RETURN 'ordinary';
END;
$function$;

REVOKE ALL ON FUNCTION public.classify_champ_result_stage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.classify_champ_result_stage(uuid) TO service_role;

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
BEGIN
  IF NEW.is_bye THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status, '') <> 'completed' THEN RETURN NEW; END IF;
  IF NEW.winner_member_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.status, '') = 'completed'
     AND COALESCE(OLD.winner_member_id::text, '') = COALESCE(NEW.winner_member_id::text, '') THEN
    RETURN NEW;
  END IF;

  SELECT t.club_id, t.name INTO v_club_id, v_champ_name
    FROM public.tournaments t WHERE t.id = NEW.champ_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  SELECT c.name, COALESCE(c.champ_result_emails, true) INTO v_club_name, v_enabled
    FROM public.clubs c WHERE c.id = v_club_id;
  IF NOT COALESCE(v_enabled, true) THEN RETURN NEW; END IF;

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

  FOR m IN
    SELECT cm.id, cm.name, cm.email, x.won
      FROM (
        SELECT unnest(v_winners) AS member_id, true AS won
        UNION ALL
        SELECT unnest(v_losers), false
      ) x
      JOIN public.club_members cm ON cm.id = x.member_id
     WHERE cm.email IS NOT NULL AND length(trim(cm.email)) > 3
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.email_outbox eo
       WHERE eo.ref_id = NEW.id AND eo.kind = 'champ_result' AND eo.club_member_id = m.id
    ) THEN
      CONTINUE;
    END IF;

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

    INSERT INTO public.email_outbox (club_id, club_member_id, recipient_email, recipient_name, subject, body, kind, ref_id)
    VALUES (v_club_id, m.id, trim(m.email), m.name, v_subject, v_body, 'champ_result', NEW.id);
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_champ_result_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_champ_result_emails() TO service_role;