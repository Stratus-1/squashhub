-- 1) Do not mint national person records for visitor club_members rows
CREATE OR REPLACE FUNCTION public.ensure_person_for_club_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_person uuid;
  v_id text := CASE WHEN NEW.id_number IS NOT NULL THEN regexp_replace(NEW.id_number, '\D', '', 'g') END;
  v_is_visitor boolean;
BEGIN
  IF NEW.person_id IS NOT NULL THEN RETURN NEW; END IF;

  v_is_visitor := (NEW.role = 'visitor'::club_member_role)
    OR (NEW.home_club_id IS NOT NULL)
    OR (COALESCE(NEW.home_club_name,'') <> '')
    OR EXISTS (SELECT 1 FROM public.member_fee_categories fc
                WHERE fc.id = NEW.fee_category_id AND fc.name ILIKE '%visitor%');
  IF v_is_visitor THEN
    RETURN NEW;
  END IF;

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

-- 2) Directory: only people with at least one real (non-visitor) club membership
CREATE OR REPLACE VIEW public.people_directory AS
WITH real_links AS (
  SELECT cm.*, fc.name AS fee_cat_name
  FROM club_members cm
  LEFT JOIN member_fee_categories fc ON fc.id = cm.fee_category_id
  WHERE cm.person_id IS NOT NULL
    AND cm.role <> 'visitor'::club_member_role
    AND COALESCE(fc.name, '') NOT ILIKE '%visitor%'
    AND cm.home_club_id IS NULL
    AND COALESCE(cm.home_club_name, '') = ''
),
primary_link AS (
  SELECT DISTINCT ON (cm.person_id) cm.person_id,
    cm.club_id,
    c.name AS club_name,
    cm.status::text AS membership_status,
    cm.club_member_number,
    ( SELECT po.name
        FROM organisations o
        JOIN organisation_relationships r ON r.child_org_id = o.id
        JOIN organisations po ON po.id = r.parent_org_id
       WHERE o.club_id = cm.club_id AND o.active AND po.kind = 'association'::org_kind
       LIMIT 1) AS association_name
  FROM real_links cm
  LEFT JOIN clubs c ON c.id = cm.club_id
  ORDER BY cm.person_id, (cm.status::text = 'active') DESC, cm.joined_at DESC NULLS LAST
),
link_counts AS (
  SELECT person_id, count(*)::int AS club_link_count
  FROM real_links GROUP BY person_id
)
SELECT p.id,
  p.national_player_number,
  p.full_name,
  p.gender,
  p.status,
  p.nationality,
  person_age(p.id) AS age,
  age_group_for_age(person_age(p.id)) AS age_group,
  pl.club_id AS primary_club_id,
  pl.club_name AS primary_club_name,
  pl.association_name,
  pl.membership_status,
  lc.club_link_count,
  (((((ARRAY[]::text[] ||
    CASE WHEN p.full_name IS NULL OR btrim(p.full_name) = '' THEN ARRAY['missing_name'] ELSE ARRAY[]::text[] END) ||
    CASE WHEN p.full_name ~ '^[+0-9()\-\s]{6,}$' THEN ARRAY['name_is_phone'] ELSE ARRAY[]::text[] END) ||
    CASE WHEN pl.association_name IS NULL THEN ARRAY['no_association'] ELSE ARRAY[]::text[] END) ||
    CASE WHEN p.gender IS NULL OR btrim(p.gender) = '' THEN ARRAY['missing_gender'] ELSE ARRAY[]::text[] END) ||
    CASE WHEN person_age(p.id) IS NULL THEN ARRAY['missing_age'] ELSE ARRAY[]::text[] END) ||
    CASE WHEN (p.email IS NULL OR btrim(p.email) = '') AND (p.phone IS NULL OR btrim(p.phone) = '') THEN ARRAY['no_contact'] ELSE ARRAY[]::text[] END AS quality_flags
FROM people p
JOIN link_counts lc ON lc.person_id = p.id
LEFT JOIN primary_link pl ON pl.person_id = p.id
WHERE p.merged_into_person_id IS NULL;

-- 3) Duplicate candidates: real members only, club names from real memberships
CREATE OR REPLACE FUNCTION public.people_duplicate_candidates(_limit int DEFAULT 200)
RETURNS TABLE (
  person_a_id uuid,
  person_a_name text,
  person_a_club text,
  person_b_id uuid,
  person_b_name text,
  person_b_club text,
  confidence numeric,
  reasons text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH real_links AS (
    SELECT cm.person_id, cm.club_id
    FROM public.club_members cm
    LEFT JOIN public.member_fee_categories fc ON fc.id = cm.fee_category_id
    WHERE cm.person_id IS NOT NULL
      AND cm.role <> 'visitor'::club_member_role
      AND COALESCE(fc.name,'') NOT ILIKE '%visitor%'
      AND cm.home_club_id IS NULL
      AND COALESCE(cm.home_club_name,'') = ''
  ),
  base AS (
    SELECT p.id,
           p.full_name,
           lower(regexp_replace(COALESCE(p.full_name,''), '[^a-zA-Z]', '', 'g')) AS norm_name,
           lower(btrim(COALESCE(p.email,''))) AS email,
           right(regexp_replace(COALESCE(p.phone,''), '\D', '', 'g'), 9) AS phone9,
           lower(COALESCE(p.gender,'')) AS gender
    FROM public.people p
    WHERE p.merged_into_person_id IS NULL
      AND EXISTS (SELECT 1 FROM real_links rl WHERE rl.person_id = p.id)
  ),
  pairs AS (
    SELECT a.id AS a_id, a.full_name AS a_name, b.id AS b_id, b.full_name AS b_name,
           (a.norm_name <> '' AND a.norm_name = b.norm_name) AS same_name,
           (a.email <> '' AND a.email = b.email) AS same_email,
           (length(a.phone9) = 9 AND a.phone9 = b.phone9) AS same_phone,
           (a.gender <> '' AND a.gender = b.gender) AS same_gender
    FROM base a
    JOIN base b
      ON a.id < b.id
     AND (
          (a.norm_name <> '' AND a.norm_name = b.norm_name)
       OR (a.email <> '' AND a.email = b.email)
       OR (length(a.phone9) = 9 AND a.phone9 = b.phone9)
     )
  )
  SELECT
    p.a_id,
    p.a_name,
    (SELECT c.name FROM real_links rl JOIN public.clubs c ON c.id = rl.club_id WHERE rl.person_id = p.a_id LIMIT 1),
    p.b_id,
    p.b_name,
    (SELECT c.name FROM real_links rl JOIN public.clubs c ON c.id = rl.club_id WHERE rl.person_id = p.b_id LIMIT 1),
    LEAST(0.99,
      (CASE WHEN p.same_name THEN 0.55 ELSE 0 END)
    + (CASE WHEN p.same_email THEN 0.30 ELSE 0 END)
    + (CASE WHEN p.same_phone THEN 0.25 ELSE 0 END)
    + (CASE WHEN p.same_gender THEN 0.05 ELSE 0 END)
    )::numeric(4,2),
    (ARRAY[]::text[]
      || CASE WHEN p.same_name THEN ARRAY['same name'] ELSE ARRAY[]::text[] END
      || CASE WHEN p.same_email THEN ARRAY['same email'] ELSE ARRAY[]::text[] END
      || CASE WHEN p.same_phone THEN ARRAY['same phone'] ELSE ARRAY[]::text[] END
      || CASE WHEN p.same_gender THEN ARRAY['same gender'] ELSE ARRAY[]::text[] END)
  FROM pairs p
  ORDER BY 7 DESC, 2
  LIMIT _limit;
$$;

REVOKE ALL ON FUNCTION public.people_duplicate_candidates(int) FROM public;
GRANT EXECUTE ON FUNCTION public.people_duplicate_candidates(int) TO authenticated;

-- 4) Detach visitor-only club_members rows from the national spine and
--    retire person records that exist purely because of visitor entries.
WITH visitor_rows AS (
  SELECT cm.id, cm.person_id
  FROM public.club_members cm
  LEFT JOIN public.member_fee_categories fc ON fc.id = cm.fee_category_id
  WHERE cm.person_id IS NOT NULL
    AND (cm.role = 'visitor'::club_member_role
         OR COALESCE(fc.name,'') ILIKE '%visitor%'
         OR cm.home_club_id IS NOT NULL
         OR COALESCE(cm.home_club_name,'') <> '')
)
UPDATE public.club_members cm
SET person_id = NULL
FROM visitor_rows v
WHERE cm.id = v.id;

UPDATE public.people p
SET status = 'inactive'
WHERE p.merged_into_person_id IS NULL
  AND p.status <> 'inactive'
  AND NOT EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.person_id = p.id);