-- Clear stale captain links: a league's captain_member_id must point to
-- someone who is actually registered in that league with is_captain=true.
-- This fixes "phantom captain" entries left behind when a captain was
-- moved/removed from a league without clearing the league row.
UPDATE public.leagues l
SET captain_member_id = NULL
WHERE captain_member_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.member_league_registrations mlr
    WHERE mlr.league_id = l.id
      AND mlr.club_member_id = l.captain_member_id
      AND mlr.is_captain = true
  );