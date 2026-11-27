CREATE TABLE public.tournaments(id uuid PRIMARY KEY, club_id uuid NOT NULL, beta_lifecycle jsonb);
CREATE TABLE public.club_members(id uuid PRIMARY KEY, club_id uuid NOT NULL, gender text);
CREATE TABLE public.champ_doubles_pairs(
  champ_id uuid NOT NULL,
  group_number integer NOT NULL,
  member_a uuid NOT NULL,
  member_b uuid NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_payment'
);
CREATE TABLE public.test_eligible_clubs(champ_id uuid NOT NULL, club_id uuid NOT NULL);

CREATE FUNCTION public.tournament_eligible_club_ids(p_champ_id uuid)
RETURNS TABLE(club_id uuid) LANGUAGE sql AS $$
  SELECT e.club_id FROM public.test_eligible_clubs e WHERE e.champ_id = p_champ_id;
$$;

CREATE FUNCTION public._tournament_join_club_ok(p_champ_id uuid, p_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tournament_eligible_club_ids(p_champ_id) e WHERE e.club_id = p_club_id);
$$;

-- Live rule before the fix: both players must belong to the host club.
CREATE FUNCTION public.beta_doubles_pair_category_guard()
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

CREATE TRIGGER category_guard BEFORE INSERT OR UPDATE ON public.champ_doubles_pairs
FOR EACH ROW EXECUTE FUNCTION public.beta_doubles_pair_category_guard();

INSERT INTO public.tournaments VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '{"category_types":{"3":"mixed"}}');
INSERT INTO public.test_eligible_clubs VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002');
INSERT INTO public.club_members VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'male'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'female'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'male'),
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000002', 'Ladies'),
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000003', 'female');
