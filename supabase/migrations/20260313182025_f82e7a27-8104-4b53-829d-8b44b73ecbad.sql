-- Allow any authenticated user to view leagues (needed during onboarding)
DROP POLICY IF EXISTS "Club members can view leagues" ON public.leagues;
CREATE POLICY "Authenticated users can view leagues"
ON public.leagues
FOR SELECT
TO authenticated
USING (true);