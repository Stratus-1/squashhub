-- Allow any authenticated user to view league associations and national body fees (needed during onboarding)
DROP POLICY IF EXISTS "Club members can view associations" ON public.league_associations;
CREATE POLICY "Authenticated users can view associations"
ON public.league_associations
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Club members can view national fees" ON public.national_body_fees;
CREATE POLICY "Authenticated users can view national fees"
ON public.national_body_fees
FOR SELECT
TO authenticated
USING (true);