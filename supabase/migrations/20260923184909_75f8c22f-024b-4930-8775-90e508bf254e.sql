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
  SELECT m.* INTO v_match FROM public.club_champs_matches m WHERE m.id = p_match_id;
  IF NOT FOUND THEN RETURN 'ordinary'; END IF;

  SELECT COALESCE(t.champion_scope, 'division') INTO v_scope
  FROM public.tournaments t WHERE t.id = v_match.champ_id;

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
        SELECT 1 FROM public.club_champs_matches f
        WHERE f.champ_id = v_match.champ_id AND f.group_number = v_match.group_number
          AND COALESCE(f.section_number, 0) = 0 AND f.id <> v_match.id
          AND (lower(COALESCE(f.stage, '')) LIKE 'ko%' OR lower(COALESCE(f.stage, '')) LIKE 'playoff%')
      )
    INTO v_section_count, v_has_league_final
    FROM public.club_champs_matches m
    WHERE m.champ_id = v_match.champ_id AND m.group_number = v_match.group_number;

    IF v_section_count <= 1 AND NOT v_has_league_final THEN RETURN 'title_final'; END IF;
    -- Not certain this is the title decider: use general playoff wording.
    RETURN 'early_knockout';
  END IF;

  IF v_stage LIKE 'ko%' OR v_stage LIKE 'playoff%' THEN RETURN 'early_knockout'; END IF;
  RETURN 'ordinary';
END;
$function$;

REVOKE ALL ON FUNCTION public.classify_champ_result_stage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.classify_champ_result_stage(uuid) TO service_role;