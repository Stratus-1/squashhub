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
),
visitor_counts AS (
  SELECT cm.person_id, count(*)::int AS visitor_link_count
  FROM club_members cm
  LEFT JOIN member_fee_categories fc ON fc.id = cm.fee_category_id
  WHERE cm.person_id IS NOT NULL
    AND (cm.role = 'visitor'::club_member_role
         OR COALESCE(fc.name,'') ILIKE '%visitor%'
         OR cm.home_club_id IS NOT NULL
         OR COALESCE(cm.home_club_name,'') <> '')
  GROUP BY cm.person_id
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
  COALESCE(lc.club_link_count, 0) AS club_link_count,
  ((((((ARRAY[]::text[] ||
    CASE WHEN p.full_name IS NULL OR btrim(p.full_name) = '' THEN ARRAY['missing_name'] ELSE ARRAY[]::text[] END) ||
    CASE WHEN p.full_name ~ '^[+0-9()\-\s]{6,}$' THEN ARRAY['name_is_phone'] ELSE ARRAY[]::text[] END) ||
    CASE WHEN COALESCE(lc.club_link_count, 0) = 0 THEN ARRAY['no_club_link'] ELSE ARRAY[]::text[] END) ||
    CASE WHEN COALESCE(lc.club_link_count,0) = 0 AND COALESCE(vc.visitor_link_count,0) > 0 THEN ARRAY['visitor_only'] ELSE ARRAY[]::text[] END) ||
    CASE WHEN p.gender IS NULL OR btrim(p.gender) = '' THEN ARRAY['missing_gender'] ELSE ARRAY[]::text[] END) ||
    CASE WHEN person_age(p.id) IS NULL THEN ARRAY['missing_age'] ELSE ARRAY[]::text[] END) ||
    CASE WHEN (p.email IS NULL OR btrim(p.email) = '') AND (p.phone IS NULL OR btrim(p.phone) = '') THEN ARRAY['no_contact'] ELSE ARRAY[]::text[] END AS quality_flags
FROM people p
LEFT JOIN primary_link pl ON pl.person_id = p.id
LEFT JOIN link_counts lc ON lc.person_id = p.id
LEFT JOIN visitor_counts vc ON vc.person_id = p.id
WHERE p.merged_into_person_id IS NULL;