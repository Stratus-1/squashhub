
-- national_body_fees: allow permitted admins
DROP POLICY IF EXISTS "Club admins can update national fees" ON public.national_body_fees;
DROP POLICY IF EXISTS "Club admins can manage national fees" ON public.national_body_fees;
DROP POLICY IF EXISTS "Club admins can delete national fees" ON public.national_body_fees;

CREATE POLICY "Permitted members can update national fees"
  ON public.national_body_fees FOR UPDATE
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'fees'));
CREATE POLICY "Permitted members can insert national fees"
  ON public.national_body_fees FOR INSERT
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'fees'));
CREATE POLICY "Permitted members can delete national fees"
  ON public.national_body_fees FOR DELETE
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'fees'));

-- member_fee_categories: same treatment
DROP POLICY IF EXISTS "Club admins can update fee categories" ON public.member_fee_categories;
DROP POLICY IF EXISTS "Club admins can insert fee categories" ON public.member_fee_categories;
DROP POLICY IF EXISTS "Club admins can delete fee categories" ON public.member_fee_categories;

CREATE POLICY "Permitted members can update fee categories"
  ON public.member_fee_categories FOR UPDATE
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'fees'));
CREATE POLICY "Permitted members can insert fee categories"
  ON public.member_fee_categories FOR INSERT
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'fees'));
CREATE POLICY "Permitted members can delete fee categories"
  ON public.member_fee_categories FOR DELETE
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'fees'));
