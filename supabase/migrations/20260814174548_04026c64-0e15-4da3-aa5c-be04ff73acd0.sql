
-- 1. PEOPLE (national spine, non-sensitive)
CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  national_player_number text UNIQUE,
  first_name text,
  last_name text,
  full_name text NOT NULL,
  gender text,
  email text,
  phone text,
  nationality text DEFAULT 'ZA',
  auth_user_id uuid,
  status text NOT NULL DEFAULT 'active',
  merged_into_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_people_email ON public.people (lower(email));
CREATE INDEX idx_people_auth_user ON public.people (auth_user_id);

GRANT SELECT, INSERT, UPDATE ON public.people TO authenticated;
GRANT ALL ON public.people TO service_role;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

-- 2. PRIVATE DETAILS (DOB / SA ID)
CREATE TABLE public.people_private (
  person_id uuid PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  date_of_birth date,
  id_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.people_private TO authenticated;
GRANT ALL ON public.people_private TO service_role;
ALTER TABLE public.people_private ENABLE ROW LEVEL SECURITY;

-- 3. LICENCE PRODUCTS (structure only; charging disabled)
CREATE TABLE public.national_licence_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  season_year integer NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  billing_enabled boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, season_year, code)
);
GRANT SELECT ON public.national_licence_products TO authenticated;
GRANT ALL ON public.national_licence_products TO service_role;
ALTER TABLE public.national_licence_products ENABLE ROW LEVEL SECURITY;

-- 4. PERSON AFFILIATIONS / LICENCES
CREATE TABLE public.person_affiliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  season_year integer NOT NULL,
  affiliation_status text NOT NULL DEFAULT 'pending',
  licence_type text,
  licence_product_id uuid REFERENCES public.national_licence_products(id) ON DELETE SET NULL,
  licence_status text NOT NULL DEFAULT 'none',
  licence_valid_from date,
  licence_valid_to date,
  fee_amount numeric,
  billing_enabled boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, org_id, season_year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_affiliations TO authenticated;
GRANT ALL ON public.person_affiliations TO service_role;
ALTER TABLE public.person_affiliations ENABLE ROW LEVEL SECURITY;

-- 5. LINK club_members -> people
ALTER TABLE public.club_members ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_club_members_person ON public.club_members (person_id);

-- 6. HELPERS
CREATE OR REPLACE FUNCTION public.is_person_self(_person_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.people p WHERE p.id = _person_id AND p.auth_user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.club_members cm WHERE cm.person_id = _person_id AND cm.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_person(_person_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(auth.uid())
      OR public.is_national_admin(auth.uid())
      OR public.is_person_self(_person_id)
      OR EXISTS (
        SELECT 1 FROM public.club_members cm
        WHERE cm.person_id = _person_id
          AND public.is_club_admin(auth.uid(), cm.club_id)
      )
$$;

-- Full DOB: self, platform admin, or explicitly authorised national roles only
CREATE OR REPLACE FUNCTION public.can_view_person_dob(_person_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(auth.uid())
      OR public.is_person_self(_person_id)
      OR EXISTS (
        SELECT 1 FROM public.organisation_admins oa
        WHERE oa.user_id = auth.uid()
          AND oa.role IN ('super_admin','competition_admin','tournament_director')
      )
$$;

CREATE OR REPLACE FUNCTION public.person_age(_person_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN pp.date_of_birth IS NULL THEN NULL
              ELSE date_part('year', age(pp.date_of_birth))::int END
  FROM public.people_private pp WHERE pp.person_id = _person_id
$$;

CREATE OR REPLACE FUNCTION public.age_group_for_age(_age integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _age IS NULL THEN NULL
    WHEN _age < 11 THEN 'U11'
    WHEN _age < 13 THEN 'U13'
    WHEN _age < 15 THEN 'U15'
    WHEN _age < 17 THEN 'U17'
    WHEN _age < 19 THEN 'U19'
    WHEN _age < 35 THEN 'Open'
    WHEN _age < 40 THEN 'O35'
    WHEN _age < 45 THEN 'O40'
    WHEN _age < 50 THEN 'O45'
    WHEN _age < 55 THEN 'O50'
    WHEN _age < 60 THEN 'O55'
    WHEN _age < 65 THEN 'O60'
    ELSE 'O65'
  END
$$;

CREATE OR REPLACE FUNCTION public.person_age_group(_person_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.age_group_for_age(public.person_age(_person_id))
$$;

-- Directory view: age / age group only, never DOB
CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS
SELECT p.id,
       p.national_player_number,
       p.full_name,
       p.gender,
       p.status,
       p.nationality,
       public.person_age(p.id) AS age,
       public.age_group_for_age(public.person_age(p.id)) AS age_group
FROM public.people p
WHERE p.merged_into_person_id IS NULL;
GRANT SELECT ON public.people_directory TO authenticated;

-- 7. POLICIES
CREATE POLICY "View people you are entitled to see" ON public.people
  FOR SELECT TO authenticated USING (public.can_view_person(id));
CREATE POLICY "Self or admins can update people" ON public.people
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()) OR public.is_person_self(id))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()) OR public.is_person_self(id));
CREATE POLICY "Admins can create people" ON public.people
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()));

CREATE POLICY "Restricted private detail reads" ON public.people_private
  FOR SELECT TO authenticated USING (public.can_view_person_dob(person_id));
CREATE POLICY "Restricted private detail writes" ON public.people_private
  FOR INSERT TO authenticated WITH CHECK (public.can_view_person_dob(person_id));
CREATE POLICY "Restricted private detail updates" ON public.people_private
  FOR UPDATE TO authenticated USING (public.can_view_person_dob(person_id)) WITH CHECK (public.can_view_person_dob(person_id));

CREATE POLICY "Anyone signed in can read licence products" ON public.national_licence_products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Platform or national super admins manage licence products" ON public.national_licence_products
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.has_org_role(auth.uid(), org_id, 'super_admin'))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.has_org_role(auth.uid(), org_id, 'super_admin'));

CREATE POLICY "View affiliations you may see" ON public.person_affiliations
  FOR SELECT TO authenticated USING (public.can_view_person(person_id));
CREATE POLICY "Admins manage affiliations" ON public.person_affiliations
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()) OR public.has_org_role(auth.uid(), org_id, 'association_admin'))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()) OR public.has_org_role(auth.uid(), org_id, 'association_admin'));

-- 8. updated_at triggers
CREATE TRIGGER trg_people_updated BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_people_private_updated BEFORE UPDATE ON public.people_private
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_person_affiliations_updated BEFORE UPDATE ON public.person_affiliations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_licence_products_updated BEFORE UPDATE ON public.national_licence_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. BACKFILL: one person per real human
-- 9a. group by SA ID number
WITH grouped AS (
  SELECT regexp_replace(id_number, '\D', '', 'g') AS key,
         min(name) AS full_name,
         min(gender) AS gender,
         min(email) AS email,
         min(phone) AS phone,
         min(user_id::text)::uuid AS auth_user_id
  FROM public.club_members
  WHERE id_number IS NOT NULL AND length(regexp_replace(id_number, '\D', '', 'g')) = 13
  GROUP BY 1
), ins AS (
  INSERT INTO public.people (full_name, gender, email, phone, auth_user_id)
  SELECT coalesce(full_name,'Unknown'), gender, email, phone, auth_user_id FROM grouped
  RETURNING id, lower(coalesce(email,'')) AS e, full_name
)
SELECT 1;

UPDATE public.club_members cm
SET person_id = p.id
FROM public.people p
WHERE cm.person_id IS NULL
  AND cm.id_number IS NOT NULL
  AND length(regexp_replace(cm.id_number, '\D', '', 'g')) = 13
  AND p.full_name = (
    SELECT min(c2.name) FROM public.club_members c2
    WHERE regexp_replace(c2.id_number, '\D', '', 'g') = regexp_replace(cm.id_number, '\D', '', 'g')
  )
  AND coalesce(lower(p.email),'') = coalesce(lower((
    SELECT min(c2.email) FROM public.club_members c2
    WHERE regexp_replace(c2.id_number, '\D', '', 'g') = regexp_replace(cm.id_number, '\D', '', 'g')
  )),'');

-- store SA IDs privately
INSERT INTO public.people_private (person_id, id_number)
SELECT DISTINCT ON (cm.person_id) cm.person_id, regexp_replace(cm.id_number, '\D', '', 'g')
FROM public.club_members cm
WHERE cm.person_id IS NOT NULL AND cm.id_number IS NOT NULL
  AND length(regexp_replace(cm.id_number, '\D', '', 'g')) = 13
ON CONFLICT (person_id) DO NOTHING;

-- 9b. group remaining by auth user id
INSERT INTO public.people (full_name, gender, email, phone, auth_user_id)
SELECT min(cm.name), min(cm.gender), min(cm.email), min(cm.phone), cm.user_id
FROM public.club_members cm
WHERE cm.person_id IS NULL AND cm.user_id IS NOT NULL
GROUP BY cm.user_id;

UPDATE public.club_members cm
SET person_id = p.id
FROM public.people p
WHERE cm.person_id IS NULL AND cm.user_id IS NOT NULL AND p.auth_user_id = cm.user_id;

-- 9c. group remaining by email
INSERT INTO public.people (full_name, gender, email, phone)
SELECT min(cm.name), min(cm.gender), min(cm.email), min(cm.phone)
FROM public.club_members cm
WHERE cm.person_id IS NULL AND cm.email IS NOT NULL AND cm.email <> ''
GROUP BY lower(cm.email);

UPDATE public.club_members cm
SET person_id = p.id
FROM public.people p
WHERE cm.person_id IS NULL AND cm.email IS NOT NULL AND lower(p.email) = lower(cm.email);

-- 9d. everyone else gets their own person
WITH remaining AS (
  SELECT cm.id, cm.name, cm.gender, cm.email, cm.phone FROM public.club_members cm WHERE cm.person_id IS NULL
), created AS (
  INSERT INTO public.people (full_name, gender, email, phone)
  SELECT coalesce(name,'Unknown'), gender, email, phone FROM remaining
  RETURNING id, full_name, coalesce(phone,'') AS ph
)
UPDATE public.club_members cm
SET person_id = c.id
FROM created c
WHERE cm.person_id IS NULL
  AND coalesce(cm.name,'Unknown') = c.full_name
  AND coalesce(cm.phone,'') = c.ph;

-- assign national player numbers
UPDATE public.people
SET national_player_number = 'SSA' || lpad((row_number_val)::text, 6, '0')
FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS row_number_val FROM public.people) s
WHERE public.people.id = s.id AND public.people.national_player_number IS NULL;

-- 10. MERGE TOOL
CREATE OR REPLACE FUNCTION public.merge_people(_keep_id uuid, _dup_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorised to merge people';
  END IF;
  IF _keep_id = _dup_id THEN
    RAISE EXCEPTION 'Cannot merge a person into themselves';
  END IF;

  UPDATE public.club_members SET person_id = _keep_id WHERE person_id = _dup_id;

  UPDATE public.person_affiliations a SET person_id = _keep_id
  WHERE a.person_id = _dup_id
    AND NOT EXISTS (
      SELECT 1 FROM public.person_affiliations b
      WHERE b.person_id = _keep_id AND b.org_id = a.org_id AND b.season_year = a.season_year
    );
  DELETE FROM public.person_affiliations WHERE person_id = _dup_id;

  INSERT INTO public.people_private (person_id, date_of_birth, id_number)
  SELECT _keep_id, pp.date_of_birth, pp.id_number FROM public.people_private pp WHERE pp.person_id = _dup_id
  ON CONFLICT (person_id) DO UPDATE
    SET date_of_birth = coalesce(public.people_private.date_of_birth, EXCLUDED.date_of_birth),
        id_number = coalesce(public.people_private.id_number, EXCLUDED.id_number);
  DELETE FROM public.people_private WHERE person_id = _dup_id;

  UPDATE public.people
  SET status = 'merged', merged_into_person_id = _keep_id, updated_at = now()
  WHERE id = _dup_id;
END;
$$;

-- 11. keep person record in sync when a club member is created
CREATE OR REPLACE FUNCTION public.ensure_person_for_club_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_person uuid;
  v_id text := CASE WHEN NEW.id_number IS NOT NULL THEN regexp_replace(NEW.id_number, '\D', '', 'g') END;
BEGIN
  IF NEW.person_id IS NOT NULL THEN RETURN NEW; END IF;

  IF v_id IS NOT NULL AND length(v_id) = 13 THEN
    SELECT person_id INTO v_person FROM public.people_private WHERE id_number = v_id LIMIT 1;
  END IF;

  IF v_person IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO v_person FROM public.people WHERE auth_user_id = NEW.user_id AND merged_into_person_id IS NULL LIMIT 1;
  END IF;

  IF v_person IS NULL AND NEW.email IS NOT NULL AND NEW.email <> '' THEN
    SELECT id INTO v_person FROM public.people WHERE lower(email) = lower(NEW.email) AND merged_into_person_id IS NULL LIMIT 1;
  END IF;

  IF v_person IS NULL THEN
    INSERT INTO public.people (full_name, gender, email, phone, auth_user_id)
    VALUES (coalesce(NEW.name,'Unknown'), NEW.gender, NEW.email, NEW.phone, NEW.user_id)
    RETURNING id INTO v_person;

    UPDATE public.people SET national_player_number = 'SSA' || lpad((
      coalesce((SELECT max(nullif(regexp_replace(national_player_number,'\D','','g'),'')::bigint) FROM public.people), 0) + 1)::text, 6, '0')
    WHERE id = v_person;
  END IF;

  IF v_id IS NOT NULL AND length(v_id) = 13 THEN
    INSERT INTO public.people_private (person_id, id_number) VALUES (v_person, v_id)
    ON CONFLICT (person_id) DO UPDATE SET id_number = coalesce(public.people_private.id_number, EXCLUDED.id_number);
  END IF;

  NEW.person_id := v_person;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ensure_person_for_club_member
BEFORE INSERT ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.ensure_person_for_club_member();
