CREATE SCHEMA auth;
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE FUNCTION public.is_club_admin_or_permitted(uuid,uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='00000000-0000-0000-0000-000000000001'::uuid AND $2='00000000-0000-0000-0000-000000000010'::uuid AND $3='finance' $$;
CREATE TABLE bar_guest_tabs(id uuid PRIMARY KEY,club_id uuid,token uuid,status text,closed_at timestamptz);
CREATE TABLE bar_visitor_sales(guest_tab_id uuid,total numeric);
CREATE TABLE bar_tips(tab_id uuid,amount numeric,status text);
CREATE TABLE bar_tab_payment_events(club_id uuid,tab_id uuid,action text,amount numeric,reason text,actor_user_id uuid);
CREATE FUNCTION add_to_bar_guest_tab(_tab_id uuid,_token uuid,_lines jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM 1 FROM bar_guest_tabs WHERE id = _tab_id AND token = _token; END; $$;
CREATE FUNCTION bar_open_tabs(_club_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
 IF NOT public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar') THEN RAISE EXCEPTION 'not allowed'; END IF;
 RETURN (SELECT jsonb_build_object('total', COALESCE((SELECT sum(s.total) FROM public.bar_visitor_sales s WHERE s.guest_tab_id = g.id), 0), 'status',g.status) FROM bar_guest_tabs g LIMIT 1);
END; $$;
\ir ../../../drizzle/migrations/0261_bar_admin_remove_zero_tab.sql
SELECT set_config('test.actor','00000000-0000-0000-0000-000000000001',false);
INSERT INTO bar_guest_tabs VALUES('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000010',gen_random_uuid(),'open',NULL);
INSERT INTO bar_visitor_sales VALUES('00000000-0000-0000-0000-000000000020',20),('00000000-0000-0000-0000-000000000020',-20);
SELECT bar_admin_remove_zero_tab('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020');
SELECT bar_admin_remove_zero_tab('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020');
DO $$ BEGIN
 IF (SELECT status FROM bar_guest_tabs) <> 'closed' THEN RAISE EXCEPTION 'Finance treasurer cannot remove zero tab'; END IF;
 IF (SELECT count(*) FROM bar_visitor_sales) <> 2 THEN RAISE EXCEPTION 'Sales lost'; END IF;
 IF (SELECT count(*) FROM bar_tab_payment_events) <> 1 THEN RAISE EXCEPTION 'Retry duplicated audit'; END IF;
END $$;
UPDATE bar_guest_tabs SET status='open';
INSERT INTO bar_visitor_sales VALUES('00000000-0000-0000-0000-000000000020',0.01);
DO $$ BEGIN
 BEGIN PERFORM bar_admin_remove_zero_tab('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020'); RAISE EXCEPTION 'Nonzero allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Only tabs with zero outstanding can be removed' THEN RAISE; END IF; END;
END $$;
DELETE FROM bar_visitor_sales WHERE total=0.01;
INSERT INTO bar_tips VALUES('00000000-0000-0000-0000-000000000020',10,'pending');
DO $$ BEGIN
 BEGIN PERFORM bar_admin_remove_zero_tab('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020'); RAISE EXCEPTION 'Tip ignored'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Only tabs with zero outstanding can be removed' THEN RAISE; END IF; END;
 BEGIN PERFORM bar_admin_remove_zero_tab('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000020'); RAISE EXCEPTION 'Cross club allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Not authorised' THEN RAISE; END IF; END;
 IF has_function_privilege('anon','bar_admin_remove_zero_tab(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anon granted'; END IF;
END $$;
SELECT set_config('test.actor','',false);
DO $$ BEGIN
 BEGIN PERFORM bar_admin_remove_zero_tab('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020'); RAISE EXCEPTION 'Signed out allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Not authorised' THEN RAISE; END IF; END;
END $$;
