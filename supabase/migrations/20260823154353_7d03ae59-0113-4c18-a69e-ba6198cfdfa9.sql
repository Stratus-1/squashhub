CREATE POLICY "Club admins manage rules for their club associations"
ON public.league_rules
FOR ALL
TO authenticated
USING (
  association_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.league_associations la
    WHERE la.id = league_rules.association_id
      AND la.club_id IS NOT NULL
      AND public.is_club_admin(auth.uid(), la.club_id)
  )
)
WITH CHECK (
  association_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.league_associations la
    WHERE la.id = league_rules.association_id
      AND la.club_id IS NOT NULL
      AND public.is_club_admin(auth.uid(), la.club_id)
  )
);