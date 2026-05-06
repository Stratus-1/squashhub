-- Backfill is_captain on league registrations for members whose role = 'captain'
UPDATE public.member_league_registrations r
SET is_captain = true
FROM public.club_members m
WHERE r.club_member_id = m.id
  AND m.role = 'captain'
  AND COALESCE(r.is_captain, false) = false;

-- Fill leagues.captain_member_id where empty, using the captain registration
UPDATE public.leagues l
SET captain_member_id = r.club_member_id
FROM public.member_league_registrations r
JOIN public.club_members m ON m.id = r.club_member_id
WHERE r.league_id = l.id
  AND m.role = 'captain'
  AND r.is_captain = true
  AND l.captain_member_id IS NULL;