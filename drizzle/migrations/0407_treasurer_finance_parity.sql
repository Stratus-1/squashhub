-- Treasurer (Finance permission) parity across finance actions, records and payment-proof files.
-- Every finance write/read check that only accepted club admins now also accepts
-- public.is_club_finance_writer (club admin / full admin / Finance permission; excludes chairman offices,
-- whose existing view-only guards stay untouched).

-- 1) Finance RPCs and self-edit guard triggers: widen the admin check in place.
DO $mig$
DECLARE
  v_name text;
  v_oid oid;
  v_def text;
  v_new text;
  v_names text[] := ARRAY[
    'submit_platform_invoice_eft_proof',
    'club_association_statement',
    'generate_club_association_invoice',
    'champ_fee_charge_preview',
    'champ_fee_post_charges',
    'champ_payment_claim_review',
    'champ_payment_claim_submit',
    'champ_set_entry_fee_basis',
    'admin_waive_booking_penalty',
    'purchase_data_bundle',
    'club_member_fee_payments_guard_self_fields',
    'fee_payments_guard_self_fields',
    'member_credit_transactions_guard_self_fields'
  ];
BEGIN
  FOREACH v_name IN ARRAY v_names LOOP
    SELECT p.oid INTO STRICT v_oid FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_name;
    v_def := pg_get_functiondef(v_oid);
    CONTINUE WHEN v_def LIKE '%is_club_finance_writer%';
    v_new := regexp_replace(
      v_def,
      'public\.is_club_admin\(auth\.uid\(\), ([A-Za-z_][A-Za-z0-9_.]*)\)',
      '(public.is_club_admin(auth.uid(), \1) OR public.is_club_finance_writer(auth.uid(), \1))',
      'g');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'treasurer parity: no admin check rewritten in %', v_name;
    END IF;
    EXECUTE v_new;
  END LOOP;

  -- Fee breakdown read uses a sub-select for the club id.
  SELECT p.oid INTO STRICT v_oid FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'champ_registration_fee_breakdown';
  v_def := pg_get_functiondef(v_oid);
  IF v_def NOT LIKE '%is_club_finance_writer%' THEN
    v_new := replace(v_def,
      'public.is_club_admin(auth.uid(), (SELECT club_id FROM public.club_champs WHERE id = r.champ_id))',
      '(public.is_club_admin(auth.uid(), (SELECT club_id FROM public.club_champs WHERE id = r.champ_id)) OR public.is_club_finance_writer(auth.uid(), (SELECT club_id FROM public.club_champs WHERE id = r.champ_id)))');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'treasurer parity: champ_registration_fee_breakdown not rewritten';
    END IF;
    EXECUTE v_new;
  END IF;
END
$mig$;

-- 2) Finance records
CREATE POLICY "Finance staff read champ payment claims" ON public.champ_payment_claims
  FOR SELECT TO authenticated USING (public.is_club_finance_writer(auth.uid(), club_id));
CREATE POLICY "Finance staff read champ payment claim allocations" ON public.champ_payment_claim_allocations
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.champ_payment_claims c
    WHERE c.id = champ_payment_claim_allocations.claim_id AND public.is_club_finance_writer(auth.uid(), c.club_id)));
CREATE POLICY "Finance staff manage own association payments" ON public.club_association_payments
  FOR ALL TO authenticated USING (public.is_club_finance_writer(auth.uid(), club_id))
  WITH CHECK (public.is_club_finance_writer(auth.uid(), club_id));
CREATE POLICY "Association finance staff read payments to them" ON public.club_association_payments
  FOR SELECT TO authenticated USING (public.is_club_finance_writer(auth.uid(), association_tenant_id));
CREATE POLICY "Association finance staff review payments to them" ON public.club_association_payments
  FOR UPDATE TO authenticated USING (public.is_club_finance_writer(auth.uid(), association_tenant_id))
  WITH CHECK (public.is_club_finance_writer(auth.uid(), association_tenant_id));
CREATE POLICY "Association finance staff manage issued invoices" ON public.club_association_invoices
  FOR ALL TO authenticated USING (public.is_club_finance_writer(auth.uid(), association_tenant_id))
  WITH CHECK (public.is_club_finance_writer(auth.uid(), association_tenant_id));
CREATE POLICY "Association finance staff manage issued invoice lines" ON public.club_association_invoice_lines
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.club_association_invoices i
    WHERE i.id = club_association_invoice_lines.invoice_id AND public.is_club_finance_writer(auth.uid(), i.association_tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_association_invoices i
    WHERE i.id = club_association_invoice_lines.invoice_id AND public.is_club_finance_writer(auth.uid(), i.association_tenant_id)));
CREATE POLICY "Club finance read own affiliation invoices" ON public.club_association_invoices
  FOR SELECT TO authenticated USING (public.is_club_finance_writer(auth.uid(), club_id));
CREATE POLICY "Club finance read own affiliation invoice lines" ON public.club_association_invoice_lines
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.club_association_invoices i
    WHERE i.id = club_association_invoice_lines.invoice_id AND public.is_club_finance_writer(auth.uid(), i.club_id)));
CREATE POLICY "Association finance staff manage fee items" ON public.association_fee_items
  FOR ALL TO authenticated USING (public.is_club_finance_writer(auth.uid(), association_club_id))
  WITH CHECK (public.is_club_finance_writer(auth.uid(), association_club_id));
CREATE POLICY "Finance staff view whatsapp invoices" ON public.club_whatsapp_invoices
  FOR SELECT TO authenticated USING (public.is_club_finance_writer(auth.uid(), club_id));
CREATE POLICY "Finance staff manage wifi subscriptions" ON public.club_wifi_subscriptions
  FOR ALL TO authenticated USING (public.is_club_finance_writer(auth.uid(), club_id))
  WITH CHECK (public.is_club_finance_writer(auth.uid(), club_id));
CREATE POLICY "Finance staff update member credit transactions" ON public.member_credit_transactions
  FOR UPDATE TO authenticated USING (public.is_club_finance_writer(auth.uid(), club_id))
  WITH CHECK (public.is_club_finance_writer(auth.uid(), club_id));
CREATE POLICY "Finance staff manage stitch onboarding drafts" ON public.stitch_onboarding_drafts
  FOR ALL TO authenticated USING (public.is_club_finance_writer(auth.uid(), club_id))
  WITH CHECK (public.is_club_finance_writer(auth.uid(), club_id));

-- 3) Files: proofs of payment and payment-gateway application documents
CREATE POLICY "Finance staff upload club payment proofs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.is_club_finance_writer(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Finance staff delete club payment proofs" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.is_club_finance_writer(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Finance staff view stitch onboarding docs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'stitch-onboarding'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.is_club_finance_writer(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Finance staff upload stitch onboarding docs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'stitch-onboarding'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.is_club_finance_writer(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Finance staff delete stitch onboarding docs" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'stitch-onboarding'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.is_club_finance_writer(auth.uid(), ((storage.foldername(name))[1])::uuid));