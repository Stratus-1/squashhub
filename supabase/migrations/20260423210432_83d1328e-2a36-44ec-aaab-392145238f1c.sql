-- Backfill member_league_registrations.league_association_number from
-- member_association_affiliations for EXTERNAL (non-internal) league associations.
UPDATE public.member_league_registrations mlr
SET league_association_number = src.affil_number,
    updated_at = now()
FROM (
  SELECT mlr2.id AS reg_id, maa.league_association_number AS affil_number
  FROM public.member_league_registrations mlr2
  JOIN public.leagues l ON l.id = mlr2.league_id
  JOIN public.league_associations la ON la.id = l.association_id
  JOIN public.member_association_affiliations maa
    ON maa.club_member_id = mlr2.club_member_id
   AND maa.association_id = l.association_id
   AND maa.active = true
  WHERE COALESCE(la.scope, 'external') <> 'internal'
    AND COALESCE(mlr2.league_association_number, '') IS DISTINCT FROM maa.league_association_number
) src
WHERE mlr.id = src.reg_id;