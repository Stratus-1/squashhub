CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE clubs(id uuid PRIMARY KEY,name text);
CREATE TABLE club_bar_settings(club_id uuid PRIMARY KEY REFERENCES clubs(id),updated_at timestamptz DEFAULT now(),tips_enabled boolean DEFAULT true,cash_up_enabled boolean DEFAULT true);
CREATE TABLE bar_counter_devices(id uuid PRIMARY KEY,club_id uuid,label text,active boolean DEFAULT true);
CREATE TABLE bar_counter_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid,device_id uuid,token uuid DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),expires_at timestamptz DEFAULT now()+interval '1 day',revoked_at timestamptz);
CREATE TABLE bar_tips(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid,staff_id uuid,staff_name text,amount numeric,status text DEFAULT 'pending',created_at timestamptz DEFAULT now(),earned_at timestamptz);
CREATE TABLE bar_tip_payouts(id uuid PRIMARY KEY,club_id uuid,staff_id uuid,staff_name text,amount numeric,method text DEFAULT 'cash' CONSTRAINT bar_tip_payouts_method_check CHECK(method='cash'),actor_user_id uuid);
CREATE TABLE club_journal_entries(club_id uuid,journal_ref uuid,account text,debit numeric,credit numeric,description text,created_at timestamptz DEFAULT now());
CREATE FUNCTION is_club_admin_or_permitted(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid AND $2='11111111-1111-1111-1111-111111111111'::uuid $$;
CREATE FUNCTION has_club_permission(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION _bar_tip_authorise(_club uuid,_token uuid) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE d uuid; BEGIN IF _token IS NOT NULL THEN SELECT device_id INTO d FROM bar_counter_sessions WHERE club_id=_club AND token=_token AND revoked_at IS NULL AND expires_at>now(); IF d IS NULL THEN RAISE EXCEPTION 'Personal counter PIN required'; END IF; ELSE IF NOT coalesce(is_club_admin_or_permitted(auth.uid(),_club,'bar'),false) THEN RAISE EXCEPTION 'Permission required'; END IF; END IF; RETURN d; END $$;
INSERT INTO clubs VALUES('11111111-1111-1111-1111-111111111111','Synthetic Riverside'),('99999999-9999-9999-9999-999999999999','Other');
INSERT INTO club_bar_settings(club_id) SELECT id FROM clubs;
INSERT INTO bar_counter_devices VALUES('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','A',true),('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','B',true);
CREATE FUNCTION bar_cash_up_close_v2(_club_id uuid,_token uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN -- Tips handed over in cash
 RETURN; END $$;
