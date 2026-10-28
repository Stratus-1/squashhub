CREATE OR REPLACE FUNCTION public.is_club_chairman(_user_id uuid, _club_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.user_id=_user_id AND cm.club_id=_club_id AND (
 cm.id=(SELECT chairman_member_id FROM public.clubs WHERE id=_club_id)
 OR EXISTS(SELECT 1 FROM public.club_member_permissions p JOIN public.club_permission_roles r ON r.id=p.permission_role_id WHERE p.club_member_id=cm.id AND r.club_id=_club_id AND lower(trim(r.role_name))='chairman')
 OR EXISTS(SELECT 1 FROM public.club_offices o WHERE o.club_id=_club_id AND o.club_member_id=cm.id AND o.office::text='chairman' AND o.ended_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.member_role_assignments a WHERE a.club_id=_club_id AND a.club_member_id=cm.id AND lower(trim(a.role_name))='chairman' AND a.revoked_at IS NULL)))
$$;
REVOKE ALL ON FUNCTION public.is_club_chairman(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_club_chairman(uuid,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.chairman_financial_write_allowed(_club_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NULL OR public.has_role(auth.uid(),'admin'::public.app_role) OR NOT public.is_club_chairman(auth.uid(),_club_id)
$$;
REVOKE ALL ON FUNCTION public.chairman_financial_write_allowed(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chairman_financial_write_allowed(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.club_financial_access(_club_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('chairman',public.is_club_chairman(auth.uid(),_club_id),'can_change',auth.uid() IS NOT NULL AND public.chairman_financial_write_allowed(_club_id))
$$;
REVOKE ALL ON FUNCTION public.club_financial_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.club_financial_access(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_chairman_financial_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j jsonb; oldj jsonb; cid uuid;
BEGIN
 IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin'::public.app_role) THEN RETURN COALESCE(NEW,OLD); END IF;
 j:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 oldj:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 cid:=nullif(j->>'club_id','')::uuid;
 IF TG_TABLE_NAME='clubs' THEN cid:=(j->>'id')::uuid; END IF;
 IF cid IS NULL AND j ? 'club_member_id' THEN SELECT club_id INTO cid FROM public.club_members WHERE id=(j->>'club_member_id')::uuid; END IF;
 IF cid IS NULL AND j ? 'batch_id' THEN SELECT club_id INTO cid FROM public.club_association_payable_batches WHERE id=(j->>'batch_id')::uuid; END IF;
 IF cid IS NULL AND j ? 'champ_id' THEN SELECT club_id INTO cid FROM public.tournaments WHERE id=(j->>'champ_id')::uuid; END IF;
 IF cid IS NULL AND j ? 'item_id' THEN SELECT club_id INTO cid FROM public.bar_items WHERE id=(j->>'item_id')::uuid; END IF;
 IF public.chairman_financial_write_allowed(cid) THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_TABLE_NAME='clubs' AND TG_OP='UPDATE' THEN
  IF EXISTS(SELECT 1 FROM jsonb_each(j) e WHERE e.value IS DISTINCT FROM oldj->e.key AND (e.key ~ '(bank|payment|gateway|fee|billing|recurring|credit|payday)' OR e.key='chairman_member_id')) THEN RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='club_members' THEN
  IF TG_OP='UPDATE' AND j->'fee_category_id' IS DISTINCT FROM oldj->'fee_category_id' THEN RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501'; END IF;
  RETURN COALESCE(NEW,OLD);
 END IF;
 IF TG_TABLE_NAME='league_associations' AND TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM jsonb_each(j) e WHERE e.value IS DISTINCT FROM oldj->e.key AND e.key ~ '(fee|billing|debit|recurring|pro_rate|due_)') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='bar_items' AND TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM jsonb_each(j) e WHERE e.value IS DISTINCT FROM oldj->e.key AND e.key ~ '(cost|price)') THEN RETURN NEW; END IF;
 IF coalesce(current_setting('app.chairman_self_payment',true),'')='on' THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_TABLE_NAME='member_credit_transactions' AND TG_OP='INSERT' AND j->>'user_id'=auth.uid()::text AND j->>'status'='pending' AND EXISTS(SELECT 1 FROM public.club_members WHERE id=(j->>'club_member_id')::uuid AND user_id=auth.uid() AND club_id=cid) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.guard_chairman_financial_write() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['club_journal_entries','club_journal_attachments','club_member_fee_payments','member_credit_transactions','club_bank_transactions','club_bank_statements','club_bank_rules','club_recurring_transactions','club_recurring_settings','club_member_credit_defaults','member_credit_allowance_overrides','member_fee_categories','national_body_fees','club_fees_payable','club_association_payable_batches','club_association_payable_lines','club_gl_accounts','bar_payroll_runs','bar_payroll_run_lines','bar_staff_salaries','bar_tip_payouts','bar_cash_ups','bar_stock_purchases','club_bar_settings','clubs','club_members','league_associations','bar_items'] LOOP
  EXECUTE format('CREATE TRIGGER chairman_finance_read_only BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_chairman_financial_write()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.guard_chairman_permission_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j jsonb; oldj jsonb; cid uuid; oldcid uuid; mid uuid;
BEGIN
 IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin'::public.app_role) THEN RETURN COALESCE(NEW,OLD); END IF;
 j:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 oldj:=CASE WHEN TG_OP='INSERT' THEN j ELSE to_jsonb(OLD) END;
 cid:=nullif(j->>'club_id','')::uuid; oldcid:=nullif(oldj->>'club_id','')::uuid; mid:=nullif(j->>'club_member_id','')::uuid;
 IF cid IS NULL AND mid IS NOT NULL THEN SELECT club_id INTO cid FROM public.club_members WHERE id=mid; END IF;
 IF oldcid IS NULL THEN oldcid:=cid; END IF;
 IF NOT (public.is_club_chairman(auth.uid(),cid) OR public.is_club_chairman(auth.uid(),oldcid)) THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_TABLE_NAME IN ('club_permission_roles','role_capability_templates') OR EXISTS(SELECT 1 FROM public.club_members WHERE id IN (mid,nullif(oldj->>'club_member_id','')::uuid) AND user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Chairman cannot change their own permissions or permission templates; another administrator must do this' USING ERRCODE='42501';
 END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.guard_chairman_permission_changes() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['club_member_permissions','club_permission_roles','club_offices','member_role_assignments','member_capability_overrides','role_capability_templates'] LOOP
  EXECUTE format('CREATE TRIGGER chairman_no_self_escalation BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_chairman_permission_changes()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.has_cap(_user_id uuid,_club_id uuid,_capability text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN public.is_club_chairman(_user_id,_club_id) AND NOT public.has_role(_user_id,'admin'::public.app_role) THEN _capability NOT LIKE 'fin.%' OR _capability=ANY(ARRAY['fin.overview.view','fin.bank.view','fin.reports.view']) WHEN public.club_new_perms_on(_club_id) THEN public.new_model_cap(_user_id,_club_id,_capability) ELSE public.is_club_admin(_user_id,_club_id) END
$$;
DO $$ DECLARE f record; d text; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('is_club_admin_or_permitted','has_club_permission') LOOP
  d:=pg_get_functiondef(f.oid); d:=regexp_replace(d,'SELECT ', 'SELECT public.is_club_chairman(_user_id,_club_id) OR '); EXECUTE d;
 END LOOP;
END $$;
COMMENT ON FUNCTION public.guard_chairman_financial_write() IS 'Chairman financial administration is read-only even through SECURITY DEFINER writes; personal payment exceptions must set a transaction-local flag only after validating ownership.';