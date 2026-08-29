UPDATE public.sportyhq_profiles sp
SET club_member_id = sub.member_id
FROM (
  SELECT DISTINCT ON (person_id) person_id, id AS member_id
  FROM public.club_members
  WHERE person_id IS NOT NULL
  ORDER BY person_id, joined_at ASC NULLS LAST
) sub
WHERE sp.person_id = sub.person_id
  AND sp.club_member_id IS NULL;