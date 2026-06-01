DROP POLICY IF EXISTS "Club members can view their club fee categories" ON public.member_fee_categories;

CREATE POLICY "Club members and platform admins can view fee categories"
ON public.member_fee_categories
FOR SELECT
USING (
  public.is_club_member(auth.uid(), club_id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
);