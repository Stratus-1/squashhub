DELETE FROM public.member_league_registrations mlr
USING public.leagues l, public.club_members cm
WHERE mlr.league_id = l.id
  AND mlr.club_member_id = cm.id
  AND cm.id = '05c54f4c-36af-4f9b-a59c-e9f03a14ebae'
  AND l.name = 'Ladies 1st League 2026'
  AND l.club_id = cm.club_id;
