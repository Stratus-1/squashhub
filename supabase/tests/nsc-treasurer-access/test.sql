\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE public.club_members(id uuid PRIMARY KEY,club_id uuid,user_id uuid,status text);
CREATE TABLE public.club_member_permissions(club_member_id uuid,custom_permissions text[]);
CREATE FUNCTION public.has_club_permission(uuid,uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM club_members m JOIN club_member_permissions p ON p.club_member_id=m.id WHERE m.user_id=$1 AND m.club_id=$2 AND $3=ANY(p.custom_permissions)) $$;
CREATE FUNCTION public.is_club_admin(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TYPE public.app_role AS ENUM ('admin');
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['bar_tab_entries','bar_guest_tabs','bar_visitor_sales','club_gl_accounts','club_bank_transactions','club_bank_statements','club_bank_rules','club_journal_entries','ledger_audit_log','club_fees_payable'] LOOP
  EXECUTE format('CREATE TABLE public.%I(id uuid,club_id uuid,settled boolean,settled_at timestamptz)',t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
CREATE TABLE club_member_fee_payments(id uuid,club_member_id uuid);
ALTER TABLE club_member_fee_payments ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.admin_bill_member_fee(_club_member_id uuid,_amount numeric,_fee_label text,_income_account text,_fee_type text DEFAULT 'club',_date timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _club_id uuid; BEGIN SELECT club_id INTO _club_id FROM club_members WHERE id=_club_member_id;
IF NOT public.is_club_admin(auth.uid(), _club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
RETURN '{"ok":true}'::jsonb; END $$;
CREATE FUNCTION public.bar_made_to_order_sold(_club_id uuid) RETURNS TABLE(bar_item_id uuid,sold_qty bigint) LANGUAGE plpgsql AS $$ BEGIN
IF auth.uid() IS NULL OR NOT (public.is_club_admin(auth.uid(), _club_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
RETURN QUERY SELECT _club_id,0::bigint; END $$;
CREATE FUNCTION public.bar_tab_entries_guard_self_settlement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_is_admin boolean; BEGIN
SELECT public.is_club_admin(auth.uid(), NEW.club_id) INTO v_is_admin;
IF NOT v_is_admin THEN RAISE EXCEPTION 'Forbidden'; END IF; RETURN NEW; END $$;
\ir ../../../drizzle/migrations/0219_nsc_treasurer_domain_access.sql
INSERT INTO club_members VALUES
('55704b70-fb5a-4bf9-bbde-8d7856119ff1','061e6dd9-0ec2-4427-a939-3f18ad0884c8','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','active'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','061e6dd9-0ec2-4427-a939-3f18ad0884c8','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','active');
INSERT INTO club_member_permissions VALUES ('55704b70-fb5a-4bf9-bbde-8d7856119ff1',ARRAY['bar','finance']);
INSERT INTO bar_guest_tabs VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','061e6dd9-0ec2-4427-a939-3f18ad0884c8',false,NULL),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','cccccccc-cccc-cccc-cccc-cccccccccccc',false,NULL);
INSERT INTO club_gl_accounts SELECT * FROM bar_guest_tabs;
CREATE FUNCTION public.test_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
SELECT test_assert(nsc_treasurer_domain_access(auth.uid(),'061e6dd9-0ec2-4427-a939-3f18ad0884c8','bar'),'Rachel has bar administration');
SELECT test_assert(nsc_treasurer_domain_access(auth.uid(),'061e6dd9-0ec2-4427-a939-3f18ad0884c8','finance'),'Rachel has full finance');
SELECT test_assert(NOT nsc_treasurer_domain_access(auth.uid(),'061e6dd9-0ec2-4427-a939-3f18ad0884c8','devices'),'No unrelated authority');
SELECT test_assert(NOT nsc_treasurer_domain_access(auth.uid(),'cccccccc-cccc-cccc-cccc-cccccccccccc','finance'),'No cross-club authority');
SELECT test_assert((SELECT count(*) FROM bar_guest_tabs)=1,'Bar RLS only NSC');
SELECT test_assert((SELECT count(*) FROM club_gl_accounts)=1,'Finance RLS only NSC');
UPDATE bar_guest_tabs SET settled=true;
SELECT test_assert((SELECT bool_and(settled) FROM bar_guest_tabs),'Rachel can administer NSC tabs');
INSERT INTO club_gl_accounts VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd','061e6dd9-0ec2-4427-a939-3f18ad0884c8',false,NULL);
SELECT test_assert((SELECT count(*) FROM club_gl_accounts)=2,'Rachel can manage chart of accounts');
SELECT test_assert((admin_bill_member_fee('55704b70-fb5a-4bf9-bbde-8d7856119ff1',10,'Synthetic','fee_income')->>'ok')::boolean,'Rachel can bill a member');
SELECT test_assert((SELECT count(*) FROM bar_made_to_order_sold('061e6dd9-0ec2-4427-a939-3f18ad0884c8'))=1,'Rachel can read bar sales');
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
SELECT test_assert((SELECT count(*) FROM bar_guest_tabs)=0,'Other members gain no bar access');
SELECT test_assert((SELECT count(*) FROM club_gl_accounts)=0,'Other members gain no finance access');
RESET ROLE;
UPDATE club_member_permissions SET custom_permissions=ARRAY[]::text[];
SELECT test_assert(NOT nsc_treasurer_domain_access('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','061e6dd9-0ec2-4427-a939-3f18ad0884c8','finance'),'Revocation removes access');
ROLLBACK;