CREATE OR REPLACE FUNCTION public.champ_result_stage_rule(
  p_stage text,
  p_stage_label text,
  p_champion_scope text,
  p_section_number integer,
  p_section_count integer,
  p_has_league_final boolean
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_label text := lower(COALESCE(p_stage_label, ''));
  v_stage text := lower(COALESCE(p_stage, ''));
  v_scope text := COALESCE(p_champion_scope, 'division');
BEGIN
  IF v_stage IN ('group', 'pool', 'league', '') THEN RETURN 'ordinary'; END IF;
  IF v_stage = 'playoff_3rd' OR v_label ~ '(3rd|third)[[:space:]-]*place' THEN RETURN 'third_place'; END IF;
  IF v_label LIKE '%quarter-final%' OR v_label LIKE '%quarter final%' OR v_stage = 'playoff_qf' THEN RETURN 'quarter_final'; END IF;
  IF v_label LIKE '%semi-final%' OR v_label LIKE '%semi final%' OR v_stage = 'playoff_sf' THEN RETURN 'semi_final'; END IF;

  IF v_label LIKE '%final%' OR v_stage = 'playoff_final' THEN
    IF v_label ~ '(pos|position)[[:space:]]*[2-9]' THEN RETURN 'placement_final'; END IF;
    IF v_scope = 'pool' THEN RETURN 'title_final'; END IF;
    IF COALESCE(p_section_number, 0) = 0 THEN RETURN 'title_final'; END IF;
    IF v_label LIKE '%league final%' THEN RETURN 'title_final'; END IF;
    IF COALESCE(p_section_count, 0) <= 1 AND NOT COALESCE(p_has_league_final, false) THEN RETURN 'title_final'; END IF;
    RETURN 'semi_final';
  END IF;

  IF v_stage LIKE 'ko%' OR v_stage LIKE 'playoff%' THEN RETURN 'early_knockout'; END IF;
  RETURN 'ordinary';
END;
$function$;

REVOKE ALL ON FUNCTION public.champ_result_stage_rule(text, text, text, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.champ_result_stage_rule(text, text, text, integer, integer, boolean) TO service_role;

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

  RETURN public.champ_result_stage_rule(
    v_match.stage,
    v_match.stage_label,
    v_scope,
    v_match.section_number,
    v_section_count,
    v_has_league_final
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.classify_champ_result_stage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.classify_champ_result_stage(uuid) TO service_role;

DO $test$
BEGIN
  IF public.champ_result_stage_rule('group', NULL, 'division', 1, 1, false) <> 'ordinary' THEN
    RAISE EXCEPTION 'champ result rule failed: group match';
  END IF;
  IF public.champ_result_stage_rule('ko', 'Quarter-final', 'division', 1, 1, false) <> 'quarter_final' THEN
    RAISE EXCEPTION 'champ result rule failed: quarter-final';
  END IF;
  IF public.champ_result_stage_rule('ko', 'Semi-final', 'division', 1, 1, false) <> 'semi_final' THEN
    RAISE EXCEPTION 'champ result rule failed: semi-final';
  END IF;
  IF public.champ_result_stage_rule('ko', 'Final', 'division', 1, 1, false) <> 'title_final' THEN
    RAISE EXCEPTION 'champ result rule failed: single-section final';
  END IF;
  IF public.champ_result_stage_rule('ko', 'Section A · Final', 'division', 1, 2, true) <> 'semi_final' THEN
    RAISE EXCEPTION 'champ result rule failed: section final';
  END IF;
  IF public.champ_result_stage_rule('ko', 'Pool A · Final', 'pool', 1, 3, false) <> 'title_final' THEN
    RAISE EXCEPTION 'champ result rule failed: pool champion';
  END IF;
  IF public.champ_result_stage_rule('playoff_final', 'Position 1 · Final', 'division', 0, 0, false) <> 'title_final' THEN
    RAISE EXCEPTION 'champ result rule failed: position 1 final';
  END IF;
  IF public.champ_result_stage_rule('playoff_final', 'Position 2 · Final', 'division', 0, 0, false) <> 'placement_final' THEN
    RAISE EXCEPTION 'champ result rule failed: placement final';
  END IF;
  IF public.champ_result_stage_rule('playoff_3rd', '3rd Place Play-off', 'division', 0, 0, false) <> 'third_place' THEN
    RAISE EXCEPTION 'champ result rule failed: third place';
  END IF;
  IF public.champ_result_stage_rule('ko', 'Round of 16', 'division', 1, 1, false) <> 'early_knockout' THEN
    RAISE EXCEPTION 'champ result rule failed: early knockout';
  END IF;
END;
$test$;