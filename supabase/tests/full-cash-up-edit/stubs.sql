CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
SELECT set_config('test.uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
CREATE TABLE bar_counter_devices(id uuid PRIMARY KEY,club_id uuid,label text);
CREATE TABLE bar_tips(club_id uuid,staff_id uuid,amount numeric,status text,created_at timestamptz DEFAULT '2026-10-20T00:00Z',earned_at timestamptz);
CREATE TABLE bar_tip_payouts(id uuid PRIMARY KEY,club_id uuid,staff_id uuid,staff_name text,amount numeric CHECK(amount>0),actor_user_id uuid,created_at timestamptz DEFAULT '2026-10-22T04:46Z');
CREATE TABLE club_journal_entries(club_id uuid,journal_ref uuid,account text,debit numeric,credit numeric,description text,reverses_journal_ref uuid,custom_account_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE audit_events(club_id uuid,actor_user_id uuid,entity_type text,entity_id uuid,action text,reason text,before_data jsonb,after_data jsonb);
CREATE TABLE bar_cash_ups(id uuid PRIMARY KEY,club_id uuid,period_start timestamptz,period_end timestamptz,totals jsonb,expected_cash numeric,counted_cash numeric,variance numeric,note text,closed_by_device uuid,closed_by_name text,actor_user_id uuid,tips_paid_at_cash_up numeric,card_expected numeric,card_counted numeric,written_off boolean,write_off_amount numeric);
CREATE FUNCTION is_club_admin_or_permitted(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid AND $2='11111111-1111-1111-1111-111111111111'::uuid $$;
CREATE FUNCTION has_club_permission(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION _bar_tip_authorise(_club uuid,_token uuid) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN
 IF NOT coalesce(is_club_admin_or_permitted(auth.uid(),_club,'bar'),false) THEN RAISE EXCEPTION 'Bar or finance permission required'; END IF; RETURN NULL; END $$;
INSERT INTO bar_counter_devices VALUES('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Test staff');
INSERT INTO bar_tips VALUES('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',100,'earned','2026-10-20T00:00Z','2026-10-20T00:00Z');
INSERT INTO bar_cash_ups(id,club_id,period_start,period_end,totals,expected_cash,counted_cash,variance,tips_paid_at_cash_up,card_expected,card_counted,written_off,write_off_amount)
 VALUES('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','2026-10-21T00:00Z','2026-10-22T04:46Z','{"cash_opening":142,"tip_payouts":40,"methods":{"cash":{"sales":88,"tips":0},"card_bar":{"sales":519,"tips":56}}}',190,230,40,40,575,575,true,40);
INSERT INTO bar_tip_payouts VALUES(md5('33333333-3333-3333-3333-333333333333:22222222-2222-2222-2222-222222222222')::uuid,'11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Test staff',40,NULL,'2026-10-22T04:46Z');
INSERT INTO club_journal_entries(club_id,journal_ref,account,debit,credit) VALUES
 ('11111111-1111-1111-1111-111111111111',md5('33333333-3333-3333-3333-333333333333:22222222-2222-2222-2222-222222222222')::uuid,'bar_cost_of_sales',40,0),
 ('11111111-1111-1111-1111-111111111111',md5('33333333-3333-3333-3333-333333333333:22222222-2222-2222-2222-222222222222')::uuid,'cash',0,40),
 ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','cash',40,0),
 ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','bar_cost_of_sales',0,40);