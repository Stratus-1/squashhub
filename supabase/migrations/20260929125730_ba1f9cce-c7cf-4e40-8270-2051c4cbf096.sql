CREATE OR REPLACE FUNCTION public.diamond_seed_doubles_from_singles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prefix text; n int; done int; home uuid[]; away uuid[]; r record; k int := 0;
BEGIN
  IF NEW.stage_key IS NULL OR NEW.stage_key NOT LIKE 'dl:%' OR NEW.partner_a_member_id IS NOT NULL OR NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  prefix := regexp_replace(NEW.stage_key, ':\d+$', '');
  SELECT count(*), count(*) FILTER (WHERE status = 'completed' AND side_a_points IS NOT NULL AND side_b_points IS NOT NULL)
    INTO n, done FROM club_champs_matches
   WHERE champ_id = NEW.champ_id AND stage_key LIKE prefix || ':%' AND partner_a_member_id IS NULL;
  IF n = 0 OR done < n THEN RETURN NEW; END IF;
  -- singles index i = position n - i; rank by points scored, level -> higher team position
  SELECT array_agg(player_a_member_id ORDER BY side_a_points DESC, (n - split_part(stage_key, ':', 3)::int) ASC),
         array_agg(player_b_member_id ORDER BY side_b_points DESC, (n - split_part(stage_key, ':', 3)::int) ASC)
    INTO home, away FROM club_champs_matches
   WHERE champ_id = NEW.champ_id AND stage_key LIKE prefix || ':%' AND partner_a_member_id IS NULL;
  -- doubles rows run bottom pair first (#5+#6 ... #1+#2)
  FOR r IN SELECT id, status, score FROM club_champs_matches
            WHERE champ_id = NEW.champ_id AND stage_key LIKE prefix || ':%' AND partner_a_member_id IS NOT NULL
            ORDER BY split_part(stage_key, ':', 3)::int LOOP
    IF r.status = 'scheduled' AND r.score IS NULL THEN
      UPDATE club_champs_matches SET
        player_a_member_id = home[n - 1 - 2*k], partner_a_member_id = home[n - 2*k],
        player_b_member_id = away[n - 1 - 2*k], partner_b_member_id = away[n - 2*k]
      WHERE id = r.id;
    END IF;
    k := k + 1;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_diamond_seed_doubles ON public.club_champs_matches;
CREATE TRIGGER trg_diamond_seed_doubles AFTER INSERT OR UPDATE OF status, side_a_points, side_b_points ON public.club_champs_matches
FOR EACH ROW EXECUTE FUNCTION public.diamond_seed_doubles_from_singles();