CREATE OR REPLACE FUNCTION public.nsc_treasurer_domain_access(_user_id uuid, _club_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT _club_id = '061e6dd9-0ec2-4427-a939-3f18ad0884c8'::uuid AND _permission IN ('bar','finance')
 AND EXISTS (SELECT 1 FROM public.club_members m WHERE m.id='55704b70-fb5a-4bf9-bbde-8d7856119ff1'::uuid AND m.club_id=_club_id AND m.user_id=_user_id AND m.status='active')
 AND public.has_club_permission(_user_id,_club_id,_permission);
$$;
REVOKE ALL ON FUNCTION public.nsc_treasurer_domain_access(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nsc_treasurer_domain_access(uuid,uuid,text) TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bar_tab_entries,public.bar_guest_tabs,public.bar_visitor_sales,public.club_gl_accounts,public.club_bank_transactions,public.club_bank_statements,public.club_bank_rules,public.club_member_fee_payments,public.club_fees_payable TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.club_journal_entries TO authenticated;
GRANT SELECT ON public.ledger_audit_log TO authenticated;
CREATE POLICY "NSC treasurer manages bar entries" ON public.bar_tab_entries FOR ALL TO authenticated USING (public.nsc_treasurer_domain_access(auth.uid(),club_id,'bar')) WITH CHECK (public.nsc_treasurer_domain_access(auth.uid(),club_id,'bar'));
CREATE POLICY "NSC treasurer manages guest tabs" ON public.bar_guest_tabs FOR ALL TO authenticated USING (public.nsc_treasurer_domain_access(auth.uid(),club_id,'bar')) WITH CHECK (public.nsc_treasurer_domain_access(auth.uid(),club_id,'bar'));
CREATE POLICY "NSC treasurer manages visitor sales" ON public.bar_visitor_sales FOR ALL TO authenticated USING (public.nsc_treasurer_domain_access(auth.uid(),club_id,'bar')) WITH CHECK (public.nsc_treasurer_domain_access(auth.uid(),club_id,'bar'));
CREATE POLICY "NSC treasurer manages GL accounts" ON public.club_gl_accounts FOR ALL TO authenticated USING (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance')) WITH CHECK (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance'));
CREATE POLICY "NSC treasurer manages bank transactions" ON public.club_bank_transactions FOR ALL TO authenticated USING (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance')) WITH CHECK (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance'));
CREATE POLICY "NSC treasurer manages bank statements" ON public.club_bank_statements FOR ALL TO authenticated USING (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance')) WITH CHECK (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance'));
CREATE POLICY "NSC treasurer manages bank rules" ON public.club_bank_rules FOR ALL TO authenticated USING (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance')) WITH CHECK (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance'));
CREATE POLICY "NSC treasurer reads journal" ON public.club_journal_entries FOR SELECT TO authenticated USING (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance'));
CREATE POLICY "NSC treasurer posts journal" ON public.club_journal_entries FOR INSERT TO authenticated WITH CHECK (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance'));
CREATE POLICY "NSC treasurer clears journal" ON public.club_journal_entries FOR DELETE TO authenticated USING (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance'));
CREATE POLICY "NSC treasurer reads ledger audit" ON public.ledger_audit_log FOR SELECT TO authenticated USING (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance'));
CREATE POLICY "NSC treasurer manages member fees" ON public.club_member_fee_payments FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.club_members m WHERE m.id=club_member_id AND public.nsc_treasurer_domain_access(auth.uid(),m.club_id,'finance'))) WITH CHECK (EXISTS(SELECT 1 FROM public.club_members m WHERE m.id=club_member_id AND public.nsc_treasurer_domain_access(auth.uid(),m.club_id,'finance')));
CREATE POLICY "NSC treasurer manages payable fees" ON public.club_fees_payable FOR ALL TO authenticated USING (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance')) WITH CHECK (public.nsc_treasurer_domain_access(auth.uid(),club_id,'finance'));
DO $$ DECLARE d text; old_guard text; BEGIN
 d:=pg_get_functiondef('public.admin_bill_member_fee(uuid,numeric,text,text,text,timestamptz)'::regprocedure);
 old_guard:='IF NOT public.is_club_admin(auth.uid(), _club_id) THEN';
 IF strpos(d,old_guard)=0 THEN RAISE EXCEPTION 'Unexpected member billing guard'; END IF;
 EXECUTE replace(d,old_guard,'IF NOT (public.is_club_admin(auth.uid(), _club_id) OR public.nsc_treasurer_domain_access(auth.uid(), _club_id, ''finance'')) THEN');
 d:=pg_get_functiondef('public.bar_made_to_order_sold(uuid)'::regprocedure);
 old_guard:='public.is_club_admin(auth.uid(), _club_id) OR public.has_role(auth.uid(), ''admin''::public.app_role)';
 IF strpos(d,old_guard)=0 THEN RAISE EXCEPTION 'Unexpected bar sales guard'; END IF;
 EXECUTE replace(d,old_guard,old_guard || ' OR public.nsc_treasurer_domain_access(auth.uid(), _club_id, ''bar'')');
 d:=pg_get_functiondef('public.bar_tab_entries_guard_self_settlement()'::regprocedure);
 old_guard:='public.is_club_admin(auth.uid(), NEW.club_id)';
 IF strpos(d,old_guard)=0 THEN RAISE EXCEPTION 'Unexpected bar settlement guard'; END IF;
 EXECUTE replace(d,old_guard,'(public.is_club_admin(auth.uid(), NEW.club_id) OR public.nsc_treasurer_domain_access(auth.uid(), NEW.club_id, ''bar''))');
END $$;