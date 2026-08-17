CREATE POLICY "Bar managers can manage bar items"
ON public.bar_items FOR ALL TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'))
WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));

CREATE POLICY "Bar managers can manage stock purchases"
ON public.bar_stock_purchases FOR ALL TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'))
WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));

CREATE POLICY "Bar managers can manage club QR codes"
ON public.qr_short_codes FOR ALL TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'))
WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));