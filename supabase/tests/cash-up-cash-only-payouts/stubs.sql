CREATE TABLE bar_guest_tabs(id uuid,club_id uuid,status text,settled_method text,payment_confirmed_at timestamptz,closed_at timestamptz,opened_at timestamptz);
CREATE TABLE bar_tips(tab_id uuid,sale_id uuid,status text,amount numeric);
CREATE TABLE bar_visitor_sales(id uuid,club_id uuid,payment_method text,total numeric,guest_tab_id uuid,payment_status text,created_at timestamptz);
CREATE TABLE bar_tip_payouts(club_id uuid,method text,amount numeric,created_at timestamptz);
CREATE TABLE club_journal_entries(club_id uuid,account text,debit numeric,credit numeric,created_at timestamptz,journal_ref uuid);
CREATE TABLE bar_cash_ups(id uuid,club_id uuid);
CREATE FUNCTION _bar_tab_sales(uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$;