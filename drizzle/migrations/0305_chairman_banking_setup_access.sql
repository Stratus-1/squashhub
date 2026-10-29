CREATE OR REPLACE FUNCTION public.chairman_banking_setup_change_allowed(_table text, _operation text, _new jsonb, _old jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE
 WHEN _operation='UPDATE' AND _new->'club_id' IS DISTINCT FROM _old->'club_id' THEN FALSE
 WHEN _table='clubs' AND _operation='UPDATE' THEN NOT EXISTS(SELECT 1 FROM jsonb_each(_new) e WHERE e.value IS DISTINCT FROM _old->e.key AND (e.key ~ '(bank|payment|gateway|fee|billing|recurring|credit|payday)' OR e.key='chairman_member_id') AND NOT e.key=ANY(ARRAY['accepted_payment_methods','payment_gateway','payment_gateways','payment_gateway_public_key','payment_gateway_fee_percent','gateway_fee_pct_capitec','gateway_fee_pct_card_intl','gateway_fee_pct_card_local','gateway_fee_pct_wallet']))
 WHEN _table='club_secrets' AND _operation IN ('INSERT','UPDATE') THEN NOT EXISTS(SELECT 1 FROM jsonb_each(_new) e WHERE e.value IS DISTINCT FROM _old->e.key AND NOT e.key=ANY(ARRAY['id','club_id','created_at','updated_at','bank_name','bank_account_name','bank_account_number','bank_branch_code','bank_reference','payment_gateway_credentials','payment_gateway_secret_key']) AND NOT (_operation='INSERT' AND e.value='null'::jsonb))
 WHEN _table='club_recurring_settings' AND _operation IN ('INSERT','UPDATE') THEN TRUE
 ELSE FALSE END
$$;
REVOKE ALL ON FUNCTION public.chairman_banking_setup_change_allowed(text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='guard_chairman_financial_write';
 IF position('IF TG_TABLE_NAME=''club_secrets''' in d)=0 THEN RAISE EXCEPTION 'Expected banking guard missing'; END IF;
 d:=replace(d,'IF TG_TABLE_NAME=''club_secrets''','IF public.chairman_banking_setup_change_allowed(TG_TABLE_NAME,TG_OP,j,oldj) THEN RETURN COALESCE(NEW,OLD); END IF; IF TG_TABLE_NAME=''club_secrets''');
 EXECUTE d;
 IF NOT public.chairman_banking_setup_change_allowed('clubs','UPDATE','{"payment_gateway":"stitch"}','{"payment_gateway":null}') OR NOT public.chairman_banking_setup_change_allowed('club_secrets','INSERT','{"bank_name":"Example","smtp_pass":null}','{}') OR NOT public.chairman_banking_setup_change_allowed('club_recurring_settings','UPDATE','{}','{}') THEN RAISE EXCEPTION 'Banking setup regression'; END IF;
 IF public.chairman_banking_setup_change_allowed('clubs','UPDATE','{"member_fee_annual":100}','{"member_fee_annual":0}') OR public.chairman_banking_setup_change_allowed('clubs','UPDATE','{"chairman_member_id":null}','{"chairman_member_id":"11111111-1111-1111-1111-111111111111"}') OR public.chairman_banking_setup_change_allowed('club_secrets','UPDATE','{"club_id":"other"}','{"club_id":"original"}') OR public.chairman_banking_setup_change_allowed('club_journal_entries','INSERT','{"debit":100}','{}') OR public.chairman_banking_setup_change_allowed('club_bank_transactions','UPDATE','{}','{}') THEN RAISE EXCEPTION 'Financial transaction boundary regression'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.club_financial_access(_club_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('chairman',public.is_club_chairman(auth.uid(),_club_id),'can_change',auth.uid() IS NOT NULL AND public.chairman_financial_write_allowed(_club_id),'can_configure_banking',auth.uid() IS NOT NULL AND public.is_club_admin_or_permitted(auth.uid(),_club_id,'banking'))
$$;
COMMENT ON FUNCTION public.chairman_banking_setup_change_allowed(text,text,jsonb,jsonb) IS 'Configuration-only chairman exception. Existing club-scope, RLS, identity and transaction guards remain authoritative.';