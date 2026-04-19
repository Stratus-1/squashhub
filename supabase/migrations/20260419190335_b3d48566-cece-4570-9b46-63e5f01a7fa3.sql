CREATE POLICY "Anyone can view active affiliations"
ON public.association_affiliated_clubs
FOR SELECT
TO anon, authenticated
USING (status = 'active');