
-- Extended national people directory: adds primary club/association/membership status + data-quality flags
CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS
WITH primary_link AS (
  SELECT DISTINCT ON (cm.person_id)
    cm.person_id,
    cm.club_id,
    c.name AS club_name,
    cm.status::text AS membership_status,
    cm.club_member_number,
    (SELECT po.name
       FROM public.organisations o
       JOIN public.organisation_relationships r ON r.child_org_id = o.id
       JOIN public.organisations po ON po.id = r.parent_org_id
      WHERE o.club_id = cm.club_id AND o.active AND po.kind = 'association'
      LIMIT 1) AS association_name
  FROM public.club_members cm
  LEFT JOIN public.clubs c ON c.id = cm.club_id
  WHERE cm.person_id IS NOT NULL
  ORDER BY cm.person_id,
           (cm.status::text = 'active') DESC,
           cm.joined_at DESC NULLS LAST
),
link_counts AS (
  SELECT person_id, count(*)::int AS club_link_count
  FROM public.club_members
  WHERE person_id IS NOT NULL
  GROUP BY person_id
)
SELECT
  p.id,
  p.national_player_number,
  p.full_name,
  p.gender,
  p.status,
  p.nationality,
  public.person_age(p.id) AS age,
  public.age_group_for_age(public.person_age(p.id)) AS age_group,
  pl.club_id       AS primary_club_id,
  pl.club_name     AS primary_club_name,
  pl.association_name,
  pl.membership_status,
  COALESCE(lc.club_link_count, 0) AS club_link_count,
  (
    ARRAY[]::text[]
    || CASE WHEN p.full_name IS NULL OR btrim(p.full_name) = '' THEN ARRAY['missing_name'] ELSE ARRAY[]::text[] END
    || CASE WHEN p.full_name ~ '^[+0-9()\-\s]{6,}$' THEN ARRAY['name_is_phone'] ELSE ARRAY[]::text[] END
    || CASE WHEN COALESCE(lc.club_link_count, 0) = 0 THEN ARRAY['no_club_link'] ELSE ARRAY[]::text[] END
    || CASE WHEN p.gender IS NULL OR btrim(p.gender) = '' THEN ARRAY['missing_gender'] ELSE ARRAY[]::text[] END
    || CASE WHEN public.person_age(p.id) IS NULL THEN ARRAY['missing_age'] ELSE ARRAY[]::text[] END
    || CASE WHEN (p.email IS NULL OR btrim(p.email) = '') AND (p.phone IS NULL OR btrim(p.phone) = '')
              THEN ARRAY['no_contact'] ELSE ARRAY[]::text[] END
  ) AS quality_flags
FROM public.people p
LEFT JOIN primary_link pl ON pl.person_id = p.id
LEFT JOIN link_counts lc ON lc.person_id = p.id
WHERE p.merged_into_person_id IS NULL;

GRANT SELECT ON public.people_directory TO authenticated;

-- Suggested duplicates with a confidence score. Never merges automatically.
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
  WITH base AS (
    SELECT p.id,
           p.full_name,
           lower(regexp_replace(COALESCE(p.full_name,''), '[^a-zA-Z]', '', 'g')) AS norm_name,
           lower(btrim(COALESCE(p.email,''))) AS email,
           right(regexp_replace(COALESCE(p.phone,''), '\D', '', 'g'), 9) AS phone9,
           lower(COALESCE(p.gender,'')) AS gender
    FROM public.people p
    WHERE p.merged_into_person_id IS NULL
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
    (SELECT c.name FROM public.club_members cm JOIN public.clubs c ON c.id = cm.club_id
      WHERE cm.person_id = p.a_id LIMIT 1),
    p.b_id,
    p.b_name,
    (SELECT c.name FROM public.club_members cm JOIN public.clubs c ON c.id = cm.club_id
      WHERE cm.person_id = p.b_id LIMIT 1),
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
  WHERE public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid())
  ORDER BY 7 DESC, 2
  LIMIT COALESCE(_limit, 200);
$$;

REVOKE ALL ON FUNCTION public.people_duplicate_candidates(int) FROM public;
GRANT EXECUTE ON FUNCTION public.people_duplicate_candidates(int) TO authenticated;
