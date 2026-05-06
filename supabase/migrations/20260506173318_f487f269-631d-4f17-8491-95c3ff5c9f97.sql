
UPDATE public.member_association_affiliations
SET association_id = (
  SELECT id FROM public.league_associations
  WHERE club_id='6486352a-9229-43e7-aa71-dfbaa18abfa7'::uuid
    AND platform_association_id='b1cb8b56-bc97-4f31-a8ea-69fab4fc6259'::uuid
  LIMIT 1
)
WHERE association_id='ff79125c-1c69-4a1a-a5bb-6e0724a493b8'::uuid
  AND club_member_id IN (
    SELECT id FROM public.club_members WHERE club_id='6486352a-9229-43e7-aa71-dfbaa18abfa7'::uuid
  );
