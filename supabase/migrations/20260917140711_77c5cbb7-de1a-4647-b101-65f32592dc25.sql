DROP POLICY IF EXISTS "Entrants can view their tournament"
ON public.tournaments;

CREATE POLICY "Authorised users can view tournaments"
ON public.tournaments
FOR SELECT
TO authenticated
USING (public.can_view_tournament(auth.uid(), id));