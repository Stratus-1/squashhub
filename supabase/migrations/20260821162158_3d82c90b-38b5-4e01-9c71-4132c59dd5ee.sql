CREATE OR REPLACE FUNCTION public.tournament_division_options(p_champ_id uuid, p_member_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  t record;
  i int;
  v_div_gender text;
  v_label text;
  out_arr jsonb := '[]'::jsonb;
BEGIN
  SELECT id, num_groups, gender, group_labels, league_genders, league_formats, league_match_types, match_type
    INTO t FROM public.tournaments WHERE id = p_champ_id;
  IF NOT FOUND THEN RETURN out_arr; END IF;

  FOR i IN 1..GREATEST(COALESCE(t.num_groups, 1), 1) LOOP
    v_div_gender := lower(COALESCE(NULLIF(COALESCE(t.league_genders ->> i::text, ''), ''), COALESCE(t.gender, 'open')));
    v_label := NULLIF(COALESCE(t.group_labels ->> i::text, ''), '');
    IF v_label IS NULL THEN v_label := 'League ' || i::text; END IF;

    -- No gender gate: all divisions are offered to every member.
    out_arr := out_arr || jsonb_build_object(
      'group_number', i,
      'label', v_label,
      'gender', v_div_gender,
      'format', COALESCE(t.league_formats ->> i::text, ''),
      'match_type', COALESCE(t.league_match_types ->> i::text, t.match_type)
    );
  END LOOP;

  RETURN out_arr;
END;
$fn$;

REVOKE ALL ON FUNCTION public.tournament_division_options(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_division_options(uuid, uuid) TO anon, authenticated, service_role;