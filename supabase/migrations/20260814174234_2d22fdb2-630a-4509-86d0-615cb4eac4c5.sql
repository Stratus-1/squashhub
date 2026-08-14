ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS is_internal_league boolean NOT NULL DEFAULT false;

-- 1. Identify association orgs that are really internal club leagues:
--    the league belongs to a club and that same club is its only member club.
WITH internal AS (
  SELECT o.id AS org_id, la.club_id, co.id AS club_org_id
  FROM public.organisations o
  JOIN public.league_associations la ON la.id = o.league_association_id
  JOIN public.organisations co ON co.club_id = la.club_id AND co.kind = 'club'
  WHERE o.kind = 'association'
    AND la.club_id IS NOT NULL
    AND (
      SELECT count(*) FROM public.organisation_relationships r
      JOIN public.organisations ch ON ch.id = r.child_org_id AND ch.kind = 'club'
      WHERE r.parent_org_id = o.id
    ) <= 1
    AND NOT EXISTS (
      SELECT 1 FROM public.organisation_relationships r
      JOIN public.organisations ch ON ch.id = r.child_org_id AND ch.kind = 'club'
      WHERE r.parent_org_id = o.id AND ch.club_id <> la.club_id
    )
)
UPDATE public.organisations o
SET is_internal_league = true
FROM internal i
WHERE o.id = i.org_id;

-- 2. Detach internal leagues from the national root and from their club-as-child link.
DELETE FROM public.organisation_relationships r
USING public.organisations o
WHERE (r.child_org_id = o.id OR r.parent_org_id = o.id)
  AND o.is_internal_league = true;

-- 3. Re-attach each internal league UNDER its own club.
INSERT INTO public.organisation_relationships (parent_org_id, child_org_id)
SELECT co.id, o.id
FROM public.organisations o
JOIN public.league_associations la ON la.id = o.league_association_id
JOIN public.organisations co ON co.club_id = la.club_id AND co.kind = 'club'
WHERE o.is_internal_league = true
  AND NOT EXISTS (
    SELECT 1 FROM public.organisation_relationships r
    WHERE r.parent_org_id = co.id AND r.child_org_id = o.id
  );

-- 4. Any club left without a parent goes into the Unaffiliated Clubs bucket.
INSERT INTO public.organisation_relationships (parent_org_id, child_org_id)
SELECT u.id, c.id
FROM public.organisations c
CROSS JOIN LATERAL (
  SELECT id FROM public.organisations WHERE name = 'Unaffiliated Clubs' LIMIT 1
) u
WHERE c.kind = 'club'
  AND NOT EXISTS (
    SELECT 1 FROM public.organisation_relationships r WHERE r.child_org_id = c.id
  );