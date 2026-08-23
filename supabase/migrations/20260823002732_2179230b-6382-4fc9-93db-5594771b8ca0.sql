DROP POLICY IF EXISTS "Anyone can register as a visitor" ON public.club_visitors;

CREATE POLICY "Club members can add visitors"
ON public.club_visitors
FOR INSERT
TO authenticated
WITH CHECK (
  club_id IS NOT NULL
  AND (
    public.is_club_member(auth.uid(), club_id)
    OR public.is_club_admin(auth.uid(), club_id)
  )
);

REVOKE INSERT ON public.club_visitors FROM anon;