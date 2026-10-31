CREATE POLICY "Finance staff manage club GL accounts"
ON public.club_gl_accounts
FOR ALL
TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'::text))
WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'::text));