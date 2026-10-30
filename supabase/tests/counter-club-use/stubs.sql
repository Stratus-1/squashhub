CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TYPE public.gl_account AS ENUM('club_stock_expense','bar_expense','shop_expense');
CREATE TABLE clubs(id uuid PRIMARY KEY);
CREATE TABLE bar_counter_devices(id uuid PRIMARY KEY,club_id uuid,label text,active boolean);
CREATE TABLE bar_counter_sessions(token uuid,club_id uuid,device_id uuid,revoked_at timestamptz,expires_at timestamptz);
CREATE TABLE bar_items(id uuid PRIMARY KEY,club_id uuid,item_kind text,name text,division text,stock_units int,unit_yield int,avg_unit_cost numeric,cost_price numeric,stock_parent_id uuid,consume_units int);
CREATE TABLE bar_special_components(special_item_id uuid,component_item_id uuid,quantity numeric);
CREATE FUNCTION bar_units_per_sale(bar_items) RETURNS int LANGUAGE sql AS $$ SELECT CASE WHEN $1.item_kind='option' THEN $1.consume_units ELSE $1.unit_yield END $$;
CREATE FUNCTION bar_item_valid_now(bar_items) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION bar_counter_board(uuid,uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE i bar_items; BEGIN RETURN jsonb_build_object('unit_yield', i.unit_yield); END $$;
CREATE TABLE bar_stock_movements(id uuid DEFAULT gen_random_uuid(),club_id uuid,bar_item_id uuid,reason text,source_table text,source_id uuid,units_delta int,note text,created_at timestamptz DEFAULT clock_timestamp(),sold_item_id uuid);
CREATE TABLE club_journal_entries(club_id uuid,journal_ref uuid,account gl_account,debit numeric,credit numeric,description text);
CREATE FUNCTION is_club_admin_or_permitted(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$;
CREATE FUNCTION bar_allow_negative_stock(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION _bar_tip_authorise(uuid,uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT device_id FROM bar_counter_sessions WHERE club_id=$1 AND token=$2 $$;
CREATE FUNCTION bar_stock_apply(_item uuid,_delta int,_reason text,_source text,_source_id uuid,_sold uuid,_clamp boolean) RETURNS int LANGUAGE plpgsql AS $$ DECLARE it bar_items; BEGIN
 SELECT * INTO it FROM bar_items WHERE id=_item FOR UPDATE;
 IF it.stock_units+_delta<0 THEN RAISE EXCEPTION 'Not enough stock'; END IF;
 UPDATE bar_items SET stock_units=stock_units+_delta WHERE id=_item;
 INSERT INTO bar_stock_movements(club_id,bar_item_id,reason,source_table,source_id,units_delta) VALUES(it.club_id,_item,_reason,_source,_source_id,_delta);
 RETURN it.stock_units+_delta;
END $$;
INSERT INTO clubs VALUES('11111111-1111-1111-1111-111111111111'),('99999999-9999-9999-9999-999999999999');
INSERT INTO bar_counter_devices VALUES('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Test server',true);
INSERT INTO bar_counter_sessions VALUES('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',NULL,now()+interval '1 day');
INSERT INTO bar_items(id,club_id,item_kind,name,division,stock_units,unit_yield,avg_unit_cost,cost_price) VALUES
 ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','stock','Squash ball','shop',10,1,25,30),
 ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','stock','Water','bar',10,1,5,7),
 ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','option','Double','bar',0,1,0,0),
 ('77777777-7777-7777-7777-777777777777','99999999-9999-9999-9999-999999999999','stock','Foreign ball','shop',10,1,25,30);