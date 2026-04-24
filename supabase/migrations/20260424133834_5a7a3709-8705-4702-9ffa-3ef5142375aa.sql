DROP TRIGGER IF EXISTS trg_auto_create_league_registration ON public.club_members;
DROP FUNCTION IF EXISTS public.auto_create_league_registration_for_member();

DELETE FROM public.member_league_registrations mlr
USING public.club_members cm, public.leagues l
WHERE mlr.club_member_id = cm.id
  AND mlr.league_id = l.id
  AND lower(cm.name) = 'grant williams'
  AND l.name = 'Ladies 1st League 2026';