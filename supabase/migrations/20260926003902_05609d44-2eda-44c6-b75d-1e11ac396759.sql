-- Helper: does the current user share an active club membership with the target user?
CREATE OR REPLACE FUNCTION public.shares_club_with(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_members mine
    JOIN public.club_members theirs
      ON theirs.club_id = mine.club_id
     AND theirs.user_id = _target_user_id
     AND theirs.status = 'active'
    WHERE mine.user_id = auth.uid()
      AND mine.status = 'active'
  )
$$;

-- player_availability: own rows + active club-mates (keeps partner/overlap features working)
DROP POLICY IF EXISTS "Availability readable by all authenticated" ON public.player_availability;
CREATE POLICY "Availability readable by owner and club-mates"
ON public.player_availability
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.shares_club_with(user_id));

-- user_streaks: owner only (app only ever reads the signed-in user's streak)
DROP POLICY IF EXISTS "Streaks readable by all authenticated" ON public.user_streaks;
CREATE POLICY "Users can read their own streaks"
ON public.user_streaks
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);