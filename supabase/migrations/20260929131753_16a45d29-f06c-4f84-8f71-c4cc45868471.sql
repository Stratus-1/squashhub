CREATE OR REPLACE FUNCTION public.diamond_seed_doubles_for_tie(p_champ uuid, p_prefix text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mode text; n int; done int; home uuid[]; away uuid[]; r record; k int := 0;
BEGIN
  IF p_prefix IS NULL OR p_prefix NOT LIKE 'dl:%' THEN RETURN; END IF;
  mode := COALESCE((SELECT tle.config->>'doublesPairing' FROM team_league_events tle
                    WHERE tle.tournament_id = p_champ LIMIT 1), 'singles_results');
  SELECT count(*), count(*) FILTER (WHERE status = 'completed' AND side_a_points IS NOT NULL AND side_b_points IS NOT NULL)
    INTO n, done FROM club_champs_matches
   WHERE champ_id = p_champ AND stage_key LIKE p_prefix || ':%' AND partner_a_member_id IS NULL;
  IF n = 0 THEN RETURN; END IF;
  IF mode = 'singles_results' AND done < n THEN RETURN; END IF;
  IF mode = 'singles_results' THEN
    -- Rank each team's players by points scored; a level score goes to the higher team position.
    SELECT array_agg(player_a_member_id ORDER BY side_a_points DESC, (n - split_part(stage_key, ':', 3)::int) ASC),
           array_agg(player_b_member_id ORDER BY side_b_points DESC, (n - split_part(stage_key, ':', 3)::int) ASC)
      INTO home, away FROM club_champs_matches
     WHERE champ_id = p_champ AND stage_key LIKE p_prefix || ':%' AND partner_a_member_id IS NULL;
  ELSE
    -- Fixed positions: home[i] ordered by team position (#1 first).
    SELECT array_agg(player_a_member_id ORDER BY split_part(stage_key, ':', 3)::int DESC),
           array_agg(player_b_member_id ORDER BY split_part(stage_key, ':', 3)::int DESC)
      INTO home, away FROM club_champs_matches
     WHERE champ_id = p_champ AND stage_key LIKE p_prefix || ':%' AND partner_a_member_id IS NULL;
  END IF;
  -- Doubles rows run bottom pair first (#5+#6 ... #1+#2); started/scored doubles are never touched.
  FOR r IN SELECT id, status, score FROM club_champs_matches
            WHERE champ_id = p_champ AND stage_key LIKE p_prefix || ':%' AND partner_a_member_id IS NOT NULL
            ORDER BY split_part(stage_key, ':', 3)::int LOOP
    IF r.status = 'scheduled' AND r.score IS NULL THEN
      UPDATE club_champs_matches SET
        player_a_member_id = home[n - 1 - 2*k], partner_a_member_id = home[n - 2*k],
        player_b_member_id = away[n - 1 - 2*k], partner_b_member_id = away[n - 2*k]
      WHERE id = r.id;
    END IF;
    k := k + 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.diamond_seed_doubles_from_singles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage_key IS NULL OR NEW.stage_key NOT LIKE 'dl:%' OR NEW.partner_a_member_id IS NOT NULL OR NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  PERFORM public.diamond_seed_doubles_for_tie(NEW.champ_id, regexp_replace(NEW.stage_key, ':\d+$', ''));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_diamond_seed_doubles ON public.club_champs_matches;
CREATE TRIGGER trg_diamond_seed_doubles AFTER INSERT OR UPDATE OF status, side_a_points, side_b_points ON public.club_champs_matches
FOR EACH ROW EXECUTE FUNCTION public.diamond_seed_doubles_from_singles();

CREATE OR REPLACE FUNCTION public.diamond_apply_pairing_mode()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  IF NEW.tournament_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.config->>'doublesPairing' IS NOT DISTINCT FROM OLD.config->>'doublesPairing' THEN RETURN NEW; END IF;
  FOR t IN SELECT DISTINCT regexp_replace(stage_key, ':\d+$', '') AS prefix FROM club_champs_matches
           WHERE champ_id = NEW.tournament_id AND stage_key LIKE 'dl:%' LOOP
    PERFORM public.diamond_seed_doubles_for_tie(NEW.tournament_id, t.prefix);
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_diamond_pairing_mode ON public.team_league_events;
CREATE TRIGGER trg_diamond_pairing_mode AFTER UPDATE OF config ON public.team_league_events
FOR EACH ROW EXECUTE FUNCTION public.diamond_apply_pairing_mode();

REVOKE EXECUTE ON FUNCTION public.diamond_seed_doubles_for_tie(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.diamond_apply_pairing_mode() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.diamond_seed_doubles_from_singles() FROM PUBLIC, anon, authenticated;