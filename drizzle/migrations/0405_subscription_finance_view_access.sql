-- Treasurers / members with the Finance permission can view their club's SquashHub subscription and invoices.
CREATE POLICY "Club finance can view own subscription"
  ON public.club_subscriptions FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'));

CREATE POLICY "Club finance can view their own invoices"
  ON public.platform_subscription_invoices FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'));