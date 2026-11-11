create role anon; create role authenticated; create role service_role;
create schema extensions;
create table clubs(id uuid primary key, min_booking_balance numeric, accepted_payment_methods text[], payment_gateway text, payment_gateways text[], currency_code text, currency_symbol text, subdomain text);
create table club_members(id uuid primary key, club_id uuid, name text);
create table club_journal_entries(id uuid primary key, club_id uuid, club_member_id uuid, account text, debit numeric default 0, credit numeric default 0, description text, created_at timestamptz, fee_payment_id uuid);
create table club_member_fee_payments(id uuid primary key, club_member_id uuid, paid_by_member_id uuid, amount numeric, paid boolean default false, paid_at timestamptz, fee_type text, fee_label text, invoice_due_date date, invoice_number text, season_year int, created_at timestamptz, updated_at timestamptz, invoice_issued_at timestamptz);
create table stitch_mandates(club_member_id uuid, status text, frequency text, suspended_at timestamptz);
create table club_secrets(club_id uuid, bank_account_number text, bank_name text, bank_account_name text, bank_branch_code text, bank_reference text);
create function mobile_internal_secret_ok(t text) returns boolean language sql as $$ select t = 'ok' $$;
