-- One-off cleanup: remove any member_league_registrations row where the
-- member's gender doesn't match the league's gender (Men in Ladies leagues,
-- Ladies in Men leagues). Mixed leagues are left untouched.
DELETE FROM public.member_league_registrations mlr
USING public.club_members cm, public.leagues l
WHERE mlr.club_member_id = cm.id
  AND mlr.league_id = l.id
  AND lower(l.name) LIKE '%ladies%'
  AND lower(coalesce(cm.gender,'')) NOT IN ('ladies','female','f');

DELETE FROM public.member_league_registrations mlr
USING public.club_members cm, public.leagues l
WHERE mlr.club_member_id = cm.id
  AND mlr.league_id = l.id
  AND (lower(l.name) LIKE 'men%' OR lower(l.name) LIKE '% men %' OR lower(l.name) LIKE 'mens%' OR lower(l.name) LIKE '%men''s%' OR lower(l.name) LIKE '% men league%')
  AND lower(coalesce(cm.gender,'')) IN ('ladies','female','f');

-- Add a guard trigger so future inserts/updates can't drop a player into a
-- gender-incompatible league. Mixed/other names are not enforced.
CREATE OR REPLACE FUNCTION public.enforce_league_gender_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_name text;
  v_member_gender text;
  v_is_ladies_league boolean;
  v_is_men_league boolean;
  v_is_ladies_member boolean;
BEGIN
  SELECT lower(l.name) INTO v_league_name FROM public.leagues l WHERE l.id = NEW.league_id;
  SELECT lower(coalesce(cm.gender,'')) INTO v_member_gender FROM public.club_members cm WHERE cm.id = NEW.club_member_id;

  v_is_ladies_league := v_league_name LIKE '%ladies%' OR v_league_name LIKE '%women%';
  v_is_men_league := (v_league_name LIKE 'men%' OR v_league_name LIKE 'mens%' OR v_league_name LIKE '%men''s%')
                      AND v_league_name NOT LIKE '%ladies%' AND v_league_name NOT LIKE '%women%';
  v_is_ladies_member := v_member_gender IN ('ladies','female','f');

  IF v_is_ladies_league AND NOT v_is_ladies_member THEN
    RAISE EXCEPTION 'Cannot register member in a Ladies league: member gender is "%"', v_member_gender;
  END IF;
  IF v_is_men_league AND v_is_ladies_member THEN
    RAISE EXCEPTION 'Cannot register member in a Men league: member gender is "%"', v_member_gender;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_league_gender_match ON public.member_league_registrations;
CREATE TRIGGER trg_enforce_league_gender_match
BEFORE INSERT OR UPDATE OF club_member_id, league_id ON public.member_league_registrations
FOR EACH ROW EXECUTE FUNCTION public.enforce_league_gender_match();