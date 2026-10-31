CREATE OR REPLACE FUNCTION public.is_club_finance_writer(_user_id uuid, _club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(_user_id,'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.club_id=_club_id AND cm.user_id=_user_id AND cm.role='admin')
    OR EXISTS (
      SELECT 1 FROM public.club_member_permissions cmp
      JOIN public.club_members cm ON cm.id = cmp.club_member_id
      LEFT JOIN public.club_permission_roles r ON r.id = cmp.permission_role_id
      WHERE cm.user_id=_user_id AND cm.club_id=_club_id
        AND (cmp.is_full_admin OR COALESCE(r.is_full_admin,false)
             OR 'finance' = ANY(COALESCE(cmp.custom_permissions,'{}'))
             OR 'finance' = ANY(COALESCE(r.permissions,'{}'))));
$$;
REVOKE ALL ON FUNCTION public.is_club_finance_writer(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_club_finance_writer(uuid,uuid) TO authenticated, service_role;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['club_journal_entries','fee_payments','club_fees_payable','club_bank_transactions','club_member_credit_defaults','club_bank_statements','club_bank_rules'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Finance staff manage %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Finance staff manage %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_club_finance_writer(auth.uid(), club_id)) WITH CHECK (public.is_club_finance_writer(auth.uid(), club_id))', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Finance staff manage member fees" ON public.club_member_fee_payments;
CREATE POLICY "Finance staff manage member fees" ON public.club_member_fee_payments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = club_member_fee_payments.club_member_id AND public.is_club_finance_writer(auth.uid(), m.club_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = club_member_fee_payments.club_member_id AND public.is_club_finance_writer(auth.uid(), m.club_id)));