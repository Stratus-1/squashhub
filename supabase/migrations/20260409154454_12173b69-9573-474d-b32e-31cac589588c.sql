
DROP POLICY "Club admins can manage leagues" ON public.leagues;
CREATE POLICY "Permitted members can insert leagues"
ON public.leagues FOR INSERT
TO authenticated
WITH CHECK (is_club_admin_or_permitted(auth.uid(), club_id, 'leagues'));

DROP POLICY "Club admins can update leagues" ON public.leagues;
CREATE POLICY "Permitted members can update leagues"
ON public.leagues FOR UPDATE
TO authenticated
USING (is_club_admin_or_permitted(auth.uid(), club_id, 'leagues'));

DROP POLICY "Club admins can delete leagues" ON public.leagues;
CREATE POLICY "Permitted members can delete leagues"
ON public.leagues FOR DELETE
TO authenticated
USING (is_club_admin_or_permitted(auth.uid(), club_id, 'leagues'));
