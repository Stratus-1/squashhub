CREATE OR REPLACE FUNCTION public.beta_doubles_pair_category_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_types jsonb; v_type text; v_a text; v_b text; v_club uuid;
BEGIN
  SELECT beta_lifecycle->'category_types', club_id INTO v_types, v_club FROM public.tournaments WHERE id = NEW.champ_id;
  IF v_types IS NULL OR v_types = 'null'::jsonb OR NEW.status IN ('cancelled','rejected') THEN RETURN NEW; END IF;
  v_type := v_types ->> NEW.group_number::text;
  IF v_type IS NULL OR v_type NOT IN ('mens','ladies','mixed','open') THEN RAISE EXCEPTION 'Invalid tournament category'; END IF;
  SELECT gender INTO v_a FROM public.club_members WHERE id = NEW.member_a AND club_id = v_club;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player is not a member of the tournament club'; END IF;
  SELECT gender INTO v_b FROM public.club_members WHERE id = NEW.member_b AND club_id = v_club;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner is not a member of the tournament club'; END IF;
  IF v_type = 'mens' AND (lower(coalesce(v_a,'')) NOT IN ('m','male','men','man','mens','men''s','gents') OR lower(coalesce(v_b,'')) NOT IN ('m','male','men','man','mens','men''s','gents')) THEN RAISE EXCEPTION 'Both partners must be eligible for the men''s category'; END IF;
  IF v_type = 'ladies' AND (lower(coalesce(v_a,'')) NOT IN ('f','female','ladies','lady','woman','women') OR lower(coalesce(v_b,'')) NOT IN ('f','female','ladies','lady','woman','women')) THEN RAISE EXCEPTION 'Both partners must be eligible for the ladies category'; END IF;
  IF v_type = 'mixed' AND NOT ((lower(coalesce(v_a,'')) IN ('m','male','men','man','mens','men''s','gents') AND lower(coalesce(v_b,'')) IN ('f','female','ladies','lady','woman','women')) OR (lower(coalesce(v_b,'')) IN ('m','male','men','man','mens','men''s','gents') AND lower(coalesce(v_a,'')) IN ('f','female','ladies','lady','woman','women'))) THEN RAISE EXCEPTION 'Mixed doubles requires one man and one lady'; END IF;
  RETURN NEW;
END $$;