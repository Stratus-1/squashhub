-- Manual ladder stats update (one-time data patch)
-- Applies the requested Played/Wins/Losses values to public.profiles.
-- This migration is non-strict: missing names are logged as NOTICE, not fatal.

DO $$
DECLARE
  r record;
  match_count integer;
BEGIN
  CREATE TEMP TABLE _ladder_updates (
    name_lower text PRIMARY KEY,
    name_variants text[] NOT NULL,
    matches_played integer NOT NULL,
    wins integer NOT NULL,
    losses integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _ladder_updates (name_lower, name_variants, matches_played, wins, losses)
  VALUES
    ('brad', ARRAY['brad','bradley'], 3, 2, 1),
    ('burt', ARRAY['burt'], 3, 3, 0),
    ('ine', ARRAY['ine'], 2, 0, 2),
    ('tarren', ARRAY['tarren'], 2, 1, 1),
    ('richard', ARRAY['richard'], 3, 2, 1),
    ('yanu', ARRAY['yanu'], 1, 1, 0),
    ('ethan', ARRAY['ethan'], 1, 0, 1);

  FOR r IN SELECT * FROM _ladder_updates ORDER BY name_lower LOOP
    SELECT count(*) INTO match_count
    FROM public.profiles
    WHERE lower(trim(name)) = ANY(r.name_variants);

    IF match_count = 0 THEN
      RAISE NOTICE 'Skipping: no profile matches any of %', r.name_variants;
      CONTINUE;
    ELSIF match_count > 1 THEN
      RAISE NOTICE 'Skipping: multiple profiles match any of % (ambiguous)', r.name_variants;
      CONTINUE;
    END IF;

    UPDATE public.profiles
    SET matches_played = r.matches_played,
        wins = r.wins,
        losses = r.losses
    WHERE lower(trim(name)) = ANY(r.name_variants);

    RAISE NOTICE 'Updated %: played=% wins=% losses=%', r.name_lower, r.matches_played, r.wins, r.losses;
  END LOOP;
END $$;

