DO $$ DECLARE f record; d text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='guard_chairman_financial_write';
 d:=replace(d,'IF public.chairman_financial_write_allowed(cid) THEN', 'IF TG_OP=''UPDATE'' AND oldj ? ''club_id'' AND oldj->>''club_id'' IS DISTINCT FROM j->>''club_id'' AND NOT public.chairman_financial_write_allowed(nullif(oldj->>''club_id'','''')::uuid) THEN RAISE EXCEPTION ''Chairman financial access is view-only'' USING ERRCODE=''42501''; END IF; IF public.chairman_financial_write_allowed(cid) THEN');
 d:=replace(d,'IF TG_TABLE_NAME=''clubs'' AND TG_OP=''UPDATE'' THEN','IF TG_TABLE_NAME=''club_secrets'' AND TG_OP=''UPDATE'' THEN IF EXISTS(SELECT 1 FROM jsonb_each(j) e WHERE e.value IS DISTINCT FROM oldj->e.key AND e.key ~ ''(bank|payment|gateway|stitch|yoco|payfast|recurring)'') THEN RAISE EXCEPTION ''Chairman financial access is view-only'' USING ERRCODE=''42501''; END IF; RETURN NEW; END IF; IF TG_TABLE_NAME=''clubs'' AND TG_OP=''UPDATE'' THEN');
 EXECUTE d;
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('admin_bill_member_fee','admin_add_member_outstanding_balance') LOOP
 d:=pg_get_functiondef(f.oid);
 d:=regexp_replace(d,'BEGIN','BEGIN IF NOT public.chairman_financial_write_allowed('||CASE WHEN f.proname='admin_bill_member_fee' THEN '(SELECT club_id FROM public.club_members WHERE id=_club_member_id)' ELSE '_club_id' END||') THEN RAISE EXCEPTION ''Chairman financial access is view-only'' USING ERRCODE=''42501''; END IF;'); EXECUTE d;
 END LOOP;
END $$;
CREATE TRIGGER chairman_finance_read_only BEFORE INSERT OR UPDATE OR DELETE ON public.club_secrets FOR EACH ROW EXECUTE FUNCTION public.guard_chairman_financial_write();
CREATE POLICY "Chairman views club journal" ON public.club_journal_entries FOR SELECT TO authenticated USING(public.is_club_chairman(auth.uid(),club_id));
CREATE POLICY "Chairman views club banking statements" ON public.club_bank_statements FOR SELECT TO authenticated USING(public.is_club_chairman(auth.uid(),club_id));
CREATE POLICY "Chairman views club bank transactions" ON public.club_bank_transactions FOR SELECT TO authenticated USING(public.is_club_chairman(auth.uid(),club_id));
CREATE POLICY "Chairman views member fees" ON public.club_member_fee_payments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.club_members m WHERE m.id=club_member_fee_payments.club_member_id AND public.is_club_chairman(auth.uid(),m.club_id)));