CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.bar_staff_can_serve(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TYPE public.gl_account AS ENUM('bank_current','debtors');
CREATE TABLE public.clubs(id uuid PRIMARY KEY,min_booking_balance numeric DEFAULT 0);
CREATE TABLE public.club_members(id uuid PRIMARY KEY,club_id uuid,user_id uuid,name text,status text DEFAULT 'active');
CREATE TABLE public.bar_counter_sessions(id uuid DEFAULT gen_random_uuid(),token uuid UNIQUE,club_id uuid,revoked_at timestamptz,expires_at timestamptz,last_seen_at timestamptz);
CREATE TABLE public.club_journal_entries(club_id uuid,club_member_id uuid,account public.gl_account,debit numeric,credit numeric,description text,journal_ref uuid);
CREATE TABLE public.member_credit_transactions(id uuid DEFAULT gen_random_uuid(),user_id uuid,club_id uuid,club_member_id uuid,amount numeric,type text,method text,status text,description text,reference text,confirmed_at timestamptz,confirmed_by uuid);
CREATE TABLE public.stitch_mandates(club_member_id uuid,club_id uuid,status text,frequency text,suspended_at timestamptz);
CREATE TABLE public.club_member_fee_payments(id uuid DEFAULT gen_random_uuid(),club_member_id uuid,fee_label text,amount numeric,paid boolean DEFAULT false,paid_at timestamptz,settled_from_wallet boolean,created_at timestamptz DEFAULT now());
-- No table access for anon: writes must go through the real definer function.
GRANT USAGE ON SCHEMA public,auth TO anon;