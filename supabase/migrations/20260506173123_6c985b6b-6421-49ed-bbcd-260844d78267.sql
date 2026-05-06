
-- 1. Per-club NSA association link for Correctional Services
INSERT INTO public.league_associations (
  club_id, name, abbreviation, platform_association_id, fee_annual, active, scope
)
SELECT
  '6486352a-9229-43e7-aa71-dfbaa18abfa7'::uuid,
  'Northern Squash Association',
  'NSA',
  'b1cb8b56-bc97-4f31-a8ea-69fab4fc6259'::uuid,
  0,
  true,
  'region'
WHERE NOT EXISTS (
  SELECT 1 FROM public.league_associations
  WHERE club_id='6486352a-9229-43e7-aa71-dfbaa18abfa7'::uuid
    AND platform_association_id='b1cb8b56-bc97-4f31-a8ea-69fab4fc6259'::uuid
);

-- 2. Repoint the league row at the per-club NSA association
UPDATE public.leagues
SET association_id = (
  SELECT id FROM public.league_associations
  WHERE club_id='6486352a-9229-43e7-aa71-dfbaa18abfa7'::uuid
    AND platform_association_id='b1cb8b56-bc97-4f31-a8ea-69fab4fc6259'::uuid
  LIMIT 1
)
WHERE club_id='6486352a-9229-43e7-aa71-dfbaa18abfa7'::uuid;

-- 3. Default-enable NSA league for all COR members
UPDATE public.club_members
SET enable_league_association_id = (
  SELECT id FROM public.league_associations
  WHERE club_id='6486352a-9229-43e7-aa71-dfbaa18abfa7'::uuid
    AND platform_association_id='b1cb8b56-bc97-4f31-a8ea-69fab4fc6259'::uuid
  LIMIT 1
),
plays_league = true
WHERE club_id='6486352a-9229-43e7-aa71-dfbaa18abfa7'::uuid;
