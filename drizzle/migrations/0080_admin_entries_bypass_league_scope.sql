CREATE OR REPLACE FUNCTION public.beta_tournament_category_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_types jsonb; v_club uuid; v_gender text; v_partner uuid; v_partner_gender text; v_type text; v_div int; v_match_type text; v_sources jsonb;
BEGIN
  SELECT t.beta_lifecycle->'category_types', t.club_id, t.league_sources INTO v_types, v_club, v_sources FROM public.tournaments t WHERE t.id = NEW.champ_id;
  IF v_types IS NULL OR v_types = 'null'::jsonb THEN RETURN NEW; END IF;
  IF NEW.status IN ('cancelled','declined','withdrawn') THEN RETURN NEW; END IF;
  IF (NEW.division_choices IS NULL OR cardinality(NEW.division_choices) = 0)
     AND COALESCE(NEW.invited_by_admin, false) AND NEW.confirmed_at IS NULL
     AND NEW.status IN ('invited','pending_payment') THEN
    RETURN NEW;
  END IF;
  IF NEW.division_choices IS NULL OR cardinality(NEW.division_choices) = 0 THEN
    RAISE EXCEPTION 'Choose an eligible category before entering this tournament';
  END IF;
  SELECT gender INTO v_gender FROM public.club_members WHERE id = NEW.club_member_id AND club_id = v_club;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player is not a member of the tournament club'; END IF;
  FOREACH v_div IN ARRAY NEW.division_choices LOOP
    v_type := v_types ->> v_div::text;
    IF v_type IS NULL OR v_type NOT IN ('mens','ladies','mixed','open') THEN RAISE EXCEPTION 'Invalid tournament category'; END IF;
    IF (v_type = 'mens' AND lower(coalesce(v_gender,'')) NOT IN ('m','male','men','man','mens','men''s','gents')) OR (v_type = 'ladies' AND lower(coalesce(v_gender,'')) NOT IN ('f','female','ladies','lady','woman','women')) THEN RAISE EXCEPTION 'Player is not eligible for the selected category'; END IF;
    -- League-scoped events: self-entries must be in one of the event's leagues; admin-entered players may be placed by override.
    IF NOT COALESCE(NEW.invited_by_admin, false)
       AND v_sources -> v_div::text IS NOT NULL
       AND jsonb_typeof(v_sources -> v_div::text) = 'array'
       AND jsonb_array_length(v_sources -> v_div::text) > 0 THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.member_league_registrations mlr
        WHERE mlr.club_member_id = NEW.club_member_id
          AND mlr.league_id::text IN (SELECT jsonb_array_elements_text(v_sources -> v_div::text))
      ) THEN
        RAISE EXCEPTION 'Player is not registered in a league for this event';
      END IF;
    END IF;
    v_partner := CASE WHEN NEW.division_partners IS NULL THEN NEW.partner_member_id
                      ELSE NULLIF(NEW.division_partners ->> v_div::text, '')::uuid END;
    IF v_partner IS NOT NULL THEN
      SELECT gender INTO v_partner_gender FROM public.club_members WHERE id = v_partner AND club_id = v_club;
      IF NOT FOUND THEN RAISE EXCEPTION 'Partner is not a member of the tournament club'; END IF;
      IF (v_type = 'mens' AND lower(coalesce(v_partner_gender,'')) NOT IN ('m','male','men','man','mens','men''s','gents')) OR (v_type = 'ladies' AND lower(coalesce(v_partner_gender,'')) NOT IN ('f','female','ladies','lady','woman','women')) THEN RAISE EXCEPTION 'Partner is not eligible for the selected category'; END IF;
      SELECT coalesce(t.league_match_types ->> v_div::text, t.match_type) INTO v_match_type FROM public.tournaments t WHERE t.id = NEW.champ_id;
      IF v_type = 'mixed' AND v_match_type = 'doubles' AND NOT (((lower(coalesce(v_gender,'')) IN ('m','male','men','man','mens','men''s','gents')) AND (lower(coalesce(v_partner_gender,'')) IN ('f','female','ladies','lady','woman','women'))) OR ((lower(coalesce(v_partner_gender,'')) IN ('m','male','men','man','mens','men''s','gents')) AND (lower(coalesce(v_gender,'')) IN ('f','female','ladies','lady','woman','women')))) THEN RAISE EXCEPTION 'Mixed doubles requires one man and one lady'; END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END
$function$;