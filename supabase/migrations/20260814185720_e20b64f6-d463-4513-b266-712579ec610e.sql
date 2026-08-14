CREATE OR REPLACE VIEW public.people_directory AS
 WITH real_links AS (
         SELECT cm.id, cm.club_id, cm.user_id, cm.role, cm.club_member_number, cm.joined_at,
            cm.person_id, cm.status,
            EXISTS (
              SELECT 1 FROM public.member_association_affiliations maa
              WHERE maa.club_member_id = cm.id AND maa.active
                AND COALESCE(maa.league_association_number, '') <> ''
            ) AS has_national_affiliation,
            fc.name AS fee_cat_name
           FROM (public.club_members cm
             LEFT JOIN public.member_fee_categories fc ON ((fc.id = cm.fee_category_id)))
          WHERE ((cm.person_id IS NOT NULL) AND (cm.role <> 'visitor'::club_member_role) AND (COALESCE(fc.name, ''::text) !~~* '%visitor%'::text) AND (cm.home_club_id IS NULL) AND (COALESCE(cm.home_club_name, ''::text) = ''::text))
        ), primary_link AS (
         SELECT DISTINCT ON (cm.person_id) cm.person_id,
            cm.club_id,
            c.name AS club_name,
            (cm.status)::text AS membership_status,
            cm.club_member_number,
            ( SELECT po.name
                   FROM ((public.organisations o
                     JOIN public.organisation_relationships r ON ((r.child_org_id = o.id)))
                     JOIN public.organisations po ON ((po.id = r.parent_org_id)))
                  WHERE ((o.club_id = cm.club_id) AND o.active AND (po.kind = 'association'::org_kind))
                 LIMIT 1) AS association_name
           FROM (real_links cm
             LEFT JOIN public.clubs c ON ((c.id = cm.club_id)))
          ORDER BY cm.person_id,
            cm.has_national_affiliation DESC,
            ((cm.status)::text = 'active'::text) DESC,
            cm.joined_at ASC NULLS LAST
        ), link_counts AS (
         SELECT real_links.person_id, (count(*))::integer AS club_link_count
           FROM real_links GROUP BY real_links.person_id
        )
 SELECT p.id,
    p.national_player_number,
    p.full_name,
    p.gender,
    p.status,
    p.nationality,
    public.person_age(p.id) AS age,
    public.age_group_for_age(public.person_age(p.id)) AS age_group,
    pl.club_id AS primary_club_id,
    pl.club_name AS primary_club_name,
    pl.association_name,
    pl.membership_status,
    lc.club_link_count,
    ((((((ARRAY[]::text[] ||
        CASE WHEN ((p.full_name IS NULL) OR (btrim(p.full_name) = ''::text)) THEN ARRAY['missing_name'::text] ELSE ARRAY[]::text[] END) ||
        CASE WHEN (p.full_name ~ '^[+0-9()\-\s]{6,}$'::text) THEN ARRAY['name_is_phone'::text] ELSE ARRAY[]::text[] END) ||
        CASE WHEN (pl.association_name IS NULL) THEN ARRAY['no_association'::text] ELSE ARRAY[]::text[] END) ||
        CASE WHEN ((p.gender IS NULL) OR (btrim(p.gender) = ''::text)) THEN ARRAY['missing_gender'::text] ELSE ARRAY[]::text[] END) ||
        CASE WHEN (public.person_age(p.id) IS NULL) THEN ARRAY['missing_age'::text] ELSE ARRAY[]::text[] END) ||
        CASE WHEN (((p.email IS NULL) OR (btrim(p.email) = ''::text)) AND ((p.phone IS NULL) OR (btrim(p.phone) = ''::text))) THEN ARRAY['no_contact'::text] ELSE ARRAY[]::text[] END) AS quality_flags
   FROM ((public.people p
     JOIN link_counts lc ON ((lc.person_id = p.id)))
     LEFT JOIN primary_link pl ON ((pl.person_id = p.id)))
  WHERE (p.merged_into_person_id IS NULL);