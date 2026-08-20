DROP POLICY IF EXISTS "Anyone authenticated can view clubs" ON public.clubs;
CREATE POLICY "Members can view their club"
ON public.clubs
FOR SELECT
TO authenticated
USING (
  public.is_club_member(auth.uid(), id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Courts viewable by all authenticated" ON public.courts;
CREATE POLICY "Members can view their club courts"
ON public.courts
FOR SELECT
TO authenticated
USING (
  (club_id IS NOT NULL AND public.is_club_member(auth.uid(), club_id))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);