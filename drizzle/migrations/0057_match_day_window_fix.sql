CREATE OR REPLACE FUNCTION public.md_window(_kind text, _id uuid, OUT starts_on date, OUT ends_on date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _kind = 'tournament' THEN
    SELECT LEAST(min(c.start_date), min(m.scheduled_date), min(m.play_by)), GREATEST(max(c.end_date), max(c.playoff_date), max(m.scheduled_date), max(m.play_by))
      INTO starts_on, ends_on
      FROM club_champs c LEFT JOIN club_champs_matches m ON m.champ_id = c.id WHERE c.id = _id;
  ELSE
    SELECT COALESCE(min(s.starts_on), min(f.fixture_date)), GREATEST(max(s.ends_on), max(f.fixture_date))
      INTO starts_on, ends_on
      FROM league_seasons s LEFT JOIN platform_league_fixtures f ON f.season_id = s.id WHERE s.id = _id;
  END IF;
  starts_on := COALESCE(starts_on, CURRENT_DATE) - 7;
  ends_on := COALESCE(ends_on, CURRENT_DATE) + 2;
END $$;