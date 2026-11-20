CREATE OR REPLACE FUNCTION public.champ_registration_payable(p_registration_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; v_types jsonb;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN 'This tournament entry could not be found'; END IF;
  IF lower(coalesce(r.status,'')) IN ('cancelled','declined','withdrawn') THEN
    RETURN 'This entry is no longer active, so no payment is needed';
  END IF;
  IF coalesce(cardinality(r.division_choices), 0) > 0 THEN RETURN NULL; END IF;
  -- Mirror beta_tournament_category_guard: only typed-category tournaments refuse an
  -- uncategorised entry. Classic multi-league champs resolve the league from membership.
  SELECT t.beta_lifecycle->'category_types' INTO v_types FROM public.tournaments t WHERE t.id = r.champ_id;
  IF v_types IS NOT NULL AND v_types <> 'null'::jsonb THEN
    RETURN 'Please choose your category on your invitation before paying the entry fee';
  END IF;
  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.champ_registration_payable(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.champ_registration_payable(uuid) TO service_role;