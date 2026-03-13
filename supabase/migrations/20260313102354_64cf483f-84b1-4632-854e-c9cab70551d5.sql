CREATE POLICY "Public can view basic club info"
ON public.clubs
FOR SELECT
TO anon
USING (true);