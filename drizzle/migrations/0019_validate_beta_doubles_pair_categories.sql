CREATE OR REPLACE FUNCTION public.beta_doubles_pair_category_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_types jsonb; v_type text; v_a text; v_b text; v_a_div int[]; v_b_div int[];
BEGIN
  SELECT beta_lifecycle->'category_types' INTO v_types FROM public.tournaments WHERE id = NEW.champ_id;
  IF v_types IS NULL OR v_types = 'null'::jsonb OR NEW.status IN ('cancelled','rejected') THEN RETURN NEW; END IF;
  v_type := v_types ->> NEW.group_number::text;
  IF v_type IS NULL OR v_type NOT IN ('mens','ladies','mixed','open') THEN RAISE EXCEPTION 'Invalid tournament category'; END IF;
  SELECT gender INTO v_a FROM public.club_members WHERE id = NEW.member_a;
  SELECT gender INTO v_b FROM public.club_members WHERE id = NEW.member_b;
  SELECT division_choices INTO v_a_div FROM public.club_champs_registrations WHERE champ_id = NEW.champ_id AND club_member_id = NEW.member_a AND status <> 'cancelled' LIMIT 1;
  SELECT division_choices INTO v_b_div FROM public.club_champs_registrations WHERE champ_id = NEW.champ_id AND club_member_id = NEW.member_b AND status <> 'cancelled' LIMIT 1;
  IF NOT (NEW.group_number = ANY(coalesce(v_a_div, '{}'::int[])) AND NEW.group_number = ANY(coalesce(v_b_div, '{}'::int[]))) THEN RAISE EXCEPTION 'Both players must be entered in this category'; END IF;
  IF v_type = 'mens' AND (lower(coalesce(v_a,'')) NOT IN ('m','male','men','man','mens','men''s','gents') OR lower(coalesce(v_b,'')) NOT IN ('m','male','men','man','mens','men''s','gents')) THEN RAISE EXCEPTION 'Both partners must be eligible for the men''s category'; END IF;
  IF v_type = 'ladies' AND (lower(coalesce(v_a,'')) NOT IN ('f','female','ladies','lady','woman','women') OR lower(coalesce(v_b,'')) NOT IN ('f','female','ladies','lady','woman','women')) THEN RAISE EXCEPTION 'Both partners must be eligible for the ladies category'; END IF;
  IF v_type = 'mixed' AND NOT ((lower(coalesce(v_a,'')) IN ('m','male','men','man','mens','men''s','gents') AND lower(coalesce(v_b,'')) IN ('f','female','ladies','lady','woman','women')) OR (lower(coalesce(v_b,'')) IN ('m','male','men','man','mens','men''s','gents') AND lower(coalesce(v_a,'')) IN ('f','female','ladies','lady','woman','women'))) THEN RAISE EXCEPTION 'Mixed doubles requires one man and one lady'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER beta_doubles_pair_category_guard_trigger BEFORE INSERT OR UPDATE OF member_a, member_b, group_number, status ON public.champ_doubles_pairs FOR EACH ROW EXECUTE FUNCTION public.beta_doubles_pair_category_guard();