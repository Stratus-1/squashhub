CREATE POLICY "Members-permission holders can view affiliations"
ON public.member_association_affiliations FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_members cm
  WHERE cm.id = member_association_affiliations.club_member_id
    AND public.has_club_permission(auth.uid(), cm.club_id, 'members')
));

CREATE POLICY "Members-permission holders can insert affiliations"
ON public.member_association_affiliations FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.club_members cm
  WHERE cm.id = member_association_affiliations.club_member_id
    AND public.has_club_permission(auth.uid(), cm.club_id, 'members')
));

CREATE POLICY "Members-permission holders can update affiliations"
ON public.member_association_affiliations FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_members cm
  WHERE cm.id = member_association_affiliations.club_member_id
    AND public.has_club_permission(auth.uid(), cm.club_id, 'members')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.club_members cm
  WHERE cm.id = member_association_affiliations.club_member_id
    AND public.has_club_permission(auth.uid(), cm.club_id, 'members')
));

CREATE POLICY "Members-permission holders can delete affiliations"
ON public.member_association_affiliations FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_members cm
  WHERE cm.id = member_association_affiliations.club_member_id
    AND public.has_club_permission(auth.uid(), cm.club_id, 'members')
));