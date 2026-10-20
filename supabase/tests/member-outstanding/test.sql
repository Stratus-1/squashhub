\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION public.is_club_admin(uuid, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '00000000-0000-0000-0000-000000000001'::uuid AND $2 = '00000000-0000-0000-0000-000000000010'::uuid $$;
CREATE OR REPLACE FUNCTION public.nsc_treasurer_domain_access(uuid, uuid, text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '00000000-0000-0000-0000-000000000002'::uuid AND $2 = '00000000-0000-0000-0000-000000000010'::uuid AND $3 = 'finance' $$;
CREATE TABLE public.club_members(id uuid PRIMARY KEY, club_id uuid);
CREATE TABLE public.club_journal_entries(club_id uuid, journal_ref uuid, account text, debit numeric, credit numeric, description text, club_member_id uuid, created_at timestamptz);
CREATE TABLE public.ledger_audit_log(club_id uuid, journal_ref uuid, action text, actor_user_id uuid, after_json jsonb, note text);
INSERT INTO public.club_members VALUES ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000010'), ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000011');
\ir ../../../drizzle/migrations/0220_member_outstanding_balance_adjustment.sql
SELECT set_config('test.actor', '00000000-0000-0000-0000-000000000001', true);
-- Existing R200 debt plus R125.50 adjustment must total R325.50.
INSERT INTO public.club_journal_entries VALUES ('00000000-0000-0000-0000-000000000010',gen_random_uuid(),'debtors',200,0,'Existing debt','00000000-0000-0000-0000-000000000020',now());
SELECT public.admin_add_member_outstanding_balance('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',125.50,'Synthetic debt','2026-10-20','00000000-0000-0000-0000-000000000030');
SELECT public.admin_add_member_outstanding_balance('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',125.50,'Synthetic debt','2026-10-20','00000000-0000-0000-0000-000000000030');
DO $$ BEGIN
 IF (SELECT sum(debit-credit) FROM public.club_journal_entries WHERE account='debtors') <> 325.50 THEN RAISE EXCEPTION 'Debt not additive or retry duplicated'; END IF;
 IF (SELECT count(*) FROM public.club_journal_entries WHERE journal_ref='00000000-0000-0000-0000-000000000030') <> 2 THEN RAISE EXCEPTION 'Must have exactly two legs'; END IF;
 IF (SELECT sum(debit-credit) FROM public.club_journal_entries WHERE journal_ref='00000000-0000-0000-0000-000000000030') <> 0 THEN RAISE EXCEPTION 'Unbalanced'; END IF;
 IF EXISTS(SELECT 1 FROM public.club_journal_entries WHERE account NOT IN ('debtors','opening_balance_equity')) THEN RAISE EXCEPTION 'Income expense or bank moved'; END IF;
 IF (SELECT count(*) FROM public.ledger_audit_log) <> 1 THEN RAISE EXCEPTION 'Audit duplicated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.club_journal_entries WHERE account='opening_balance_equity' AND credit=125.50 AND club_member_id IS NULL) THEN RAISE EXCEPTION 'Incorrect counter entry'; END IF;
 BEGIN
  PERFORM public.admin_add_member_outstanding_balance('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000021',10,'Wrong club',now(),gen_random_uuid());
  RAISE EXCEPTION 'Cross club allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Member does not belong to this club' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.admin_add_member_outstanding_balance('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',126,'Synthetic debt','2026-10-20','00000000-0000-0000-0000-000000000030');
  RAISE EXCEPTION 'Request collision allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Request ID already used for a different entry' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.admin_add_member_outstanding_balance('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',0,'Zero',now(),gen_random_uuid());
  RAISE EXCEPTION 'Zero debt allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Enter a positive amount with at most two decimal places' THEN RAISE; END IF; END;
END $$;
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000002',true);
SELECT public.admin_add_member_outstanding_balance('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',10,'Treasurer debt',now(),gen_random_uuid());
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
 BEGIN
  PERFORM public.admin_add_member_outstanding_balance('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',10,'Unauthorised',now(),gen_random_uuid());
  RAISE EXCEPTION 'Unprivileged actor allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Not authorised' THEN RAISE; END IF; END;
 IF has_function_privilege('anon','public.admin_add_member_outstanding_balance(uuid,uuid,numeric,text,timestamptz,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anon has access'; END IF;
END $$;
ROLLBACK;
\echo 'Member outstanding accounting, retry, audit and authority checks passed'