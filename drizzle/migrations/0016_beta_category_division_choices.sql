CREATE OR REPLACE FUNCTION public.tournament_division_options(p_champ_id uuid, p_member_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; i int; v_div_gender text; v_label text; v_member_gender text; v_type text; out_arr jsonb := '[]'::jsonb;
BEGIN
  SELECT id, num_groups, gender, group_labels, league_genders, league_formats, league_match_types, match_type, beta_lifecycle, club_id
    INTO t FROM public.tournaments WHERE id = p_champ_id;
  IF NOT FOUND THEN RETURN out_arr; END IF;
  IF p_member_id IS NOT NULL AND t.beta_lifecycle ? 'category_types' THEN
    SELECT gender INTO v_member_gender FROM public.club_members WHERE id = p_member_id AND club_id = t.club_id;
  END IF;
  FOR i IN 1..GREATEST(COALESCE(t.num_groups, 1), 1) LOOP
    v_div_gender := lower(COALESCE(NULLIF(COALESCE(t.league_genders ->> i::text, ''), ''), COALESCE(t.gender, 'open')));
    v_type := t.beta_lifecycle -> 'category_types' ->> i::text;
    IF v_type IS NOT NULL AND p_member_id IS NOT NULL THEN
      IF v_member_gender IS NULL AND v_type IN ('mens','ladies') THEN CONTINUE; END IF;
      IF v_type = 'mens' AND lower(coalesce(v_member_gender,'')) NOT IN ('m','male','men','man','mens','men''s','gents') THEN CONTINUE; END IF;
      IF v_type = 'ladies' AND lower(coalesce(v_member_gender,'')) NOT IN ('f','female','ladies','lady','woman','women') THEN CONTINUE; END IF;
    END IF;
    v_label := NULLIF(COALESCE(t.group_labels ->> i::text, ''), '');
    IF v_label IS NULL THEN v_label := 'League ' || i::text; END IF;
    out_arr := out_arr || jsonb_build_object('group_number', i, 'label', v_label, 'gender', coalesce(v_type, v_div_gender), 'format', COALESCE(t.league_formats ->> i::text, ''), 'match_type', COALESCE(t.league_match_types ->> i::text, t.match_type));
  END LOOP;
  RETURN out_arr;
END $$;