-- Allow platform super-admins (user_roles.role = 'admin') to update/insert/delete leagues
-- in addition to club admins / permitted members.
DROP POLICY IF EXISTS "Permitted members can update leagues" ON public.leagues;
CREATE POLICY "Permitted members can update leagues" ON public.leagues
FOR UPDATE USING (
  public.is_club_admin_or_permitted(auth.uid(), club_id, 'leagues')
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Permitted members can insert leagues" ON public.leagues;
CREATE POLICY "Permitted members can insert leagues" ON public.leagues
FOR INSERT WITH CHECK (
  public.is_club_admin_or_permitted(auth.uid(), club_id, 'leagues')
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Permitted members can delete leagues" ON public.leagues;
CREATE POLICY "Permitted members can delete leagues" ON public.leagues
FOR DELETE USING (
  public.is_club_admin_or_permitted(auth.uid(), club_id, 'leagues')
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);