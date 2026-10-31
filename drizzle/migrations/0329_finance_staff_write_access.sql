DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['club_journal_entries','fee_payments','club_fees_payable','club_bank_transactions','club_member_credit_defaults','club_bank_statements','club_bank_rules'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Finance staff manage %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Finance staff manage %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_club_admin_or_permitted(auth.uid(), club_id, ''finance'')) WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, ''finance''))', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Finance staff manage member fees" ON public.club_member_fee_payments;
CREATE POLICY "Finance staff manage member fees" ON public.club_member_fee_payments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = club_member_fee_payments.club_member_id AND public.is_club_admin_or_permitted(auth.uid(), m.club_id, 'finance')))
WITH CHECK (EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = club_member_fee_payments.club_member_id AND public.is_club_admin_or_permitted(auth.uid(), m.club_id, 'finance')));