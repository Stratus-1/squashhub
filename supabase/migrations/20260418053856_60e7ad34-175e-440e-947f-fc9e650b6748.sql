-- Fix is_league_captain to read from member_league_registrations.is_captain
-- (the actual source of truth set in Manage Leagues), instead of the unused
-- leagues.captain_member_id column.
CREATE OR REPLACE FUNCTION public.is_league_captain(_user_id uuid, _league_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.member_league_registrations mlr
    JOIN public.club_members cm ON cm.id = mlr.club_member_id
    WHERE mlr.league_id = _league_id
      AND mlr.is_captain = true
      AND cm.user_id = _user_id
  );
$$;