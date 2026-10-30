CREATE FUNCTION test_use(_token uuid DEFAULT '33333333-3333-3333-3333-333333333333',_request uuid DEFAULT '88888888-8888-8888-8888-888888888888',_qty numeric DEFAULT 2) RETURNS jsonb LANGUAGE sql AS $$
 SELECT bar_counter_club_use(_token,jsonb_build_array(jsonb_build_object('item_id','44444444-4444-4444-4444-444444444444','quantity',_qty)),'Tournament balls',_request) $$;
DO $$ BEGIN
 BEGIN PERFORM test_use(NULL); RAISE EXCEPTION 'FAIL missing PIN accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Personal counter PIN required' THEN RAISE; END IF; END;
END $$;
-- A two-double special consumes four tots plus one mixer, at component cost.
INSERT INTO bar_items(id,club_id,item_kind,name,division,stock_units,unit_yield,avg_unit_cost,cost_price,stock_parent_id,consume_units) VALUES
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','stock','Brandy bottle','bar',28,28,2,56,NULL,NULL),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111','option','Double brandy','bar',0,1,NULL,NULL,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',2),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111','special','Two doubles and water','bar',0,1,NULL,NULL,NULL,NULL);
INSERT INTO bar_special_components VALUES
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','cccccccc-cccc-cccc-cccc-cccccccccccc',2),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','55555555-5555-5555-5555-555555555555',1);
DO $$ DECLARE r jsonb; movements int; debit_before numeric; BEGIN
 SELECT count(*) INTO movements FROM bar_stock_movements;
 SELECT coalesce(sum(debit),0) INTO debit_before FROM club_journal_entries WHERE account='club_stock_expense';
 r:=bar_counter_club_use('33333333-3333-3333-3333-333333333333','[{"item_id":"dddddddd-dddd-dddd-dddd-dddddddddddd","quantity":1}]','Club event','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
 IF (r->>'cost')::numeric<>13 OR bar_club_use_unit_cost((SELECT i FROM bar_items i WHERE name='Two doubles and water'))<>13 THEN RAISE EXCEPTION 'FAIL component cost'; END IF;
 IF (SELECT stock_units FROM bar_items WHERE name='Brandy bottle')<>24 OR (SELECT stock_units FROM bar_items WHERE name='Water')<>9 THEN RAISE EXCEPTION 'FAIL four tots and mixer'; END IF;
 IF (SELECT coalesce(sum(debit),0) FROM club_journal_entries WHERE account='club_stock_expense')-debit_before<>13 THEN RAISE EXCEPTION 'FAIL special expense'; END IF;
 PERFORM bar_counter_club_use('33333333-3333-3333-3333-333333333333','[{"item_id":"dddddddd-dddd-dddd-dddd-dddddddddddd","quantity":1}]','Club event','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
 IF (SELECT count(*) FROM bar_stock_movements)<>movements+2 THEN RAISE EXCEPTION 'FAIL special replay'; END IF;
 BEGIN
  PERFORM bar_counter_club_use('33333333-3333-3333-3333-333333333333','[{"item_id":"dddddddd-dddd-dddd-dddd-dddddddddddd","quantity":20}]','Club event','ffffffff-ffff-ffff-ffff-ffffffffffff');
  RAISE EXCEPTION 'FAIL insufficient component stock accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Not enough stock' THEN RAISE; END IF; END;
 IF (SELECT stock_units FROM bar_items WHERE name='Brandy bottle')<>24 OR (SELECT stock_units FROM bar_items WHERE name='Water')<>9 THEN RAISE EXCEPTION 'FAIL component rollback'; END IF;
 DELETE FROM bar_special_components WHERE special_item_id='dddddddd-dddd-dddd-dddd-dddddddddddd';
 INSERT INTO bar_special_components VALUES('dddddddd-dddd-dddd-dddd-dddddddddddd','77777777-7777-7777-7777-777777777777',1);
 BEGIN
  PERFORM bar_counter_club_use('33333333-3333-3333-3333-333333333333','[{"item_id":"dddddddd-dddd-dddd-dddd-dddddddddddd","quantity":1}]','Club event','ffffffff-ffff-ffff-ffff-ffffffffffff');
  RAISE EXCEPTION 'FAIL foreign component accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Special components must be stock products or serving options from this club' THEN RAISE; END IF; END;
 DELETE FROM bar_stock_movements; DELETE FROM club_journal_entries; DELETE FROM bar_club_use_requests;
 UPDATE bar_items SET stock_units=10 WHERE name='Water';
END $$;
DO $$ BEGIN
 UPDATE bar_counter_sessions SET revoked_at=now();
 BEGIN PERFORM test_use(); RAISE EXCEPTION 'FAIL revoked accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Personal counter PIN required' THEN RAISE; END IF; END;
 UPDATE bar_counter_sessions SET revoked_at=NULL,expires_at=now()-interval '1 second';
 BEGIN PERFORM test_use(); RAISE EXCEPTION 'FAIL expired accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Personal counter PIN required' THEN RAISE; END IF; END;
 UPDATE bar_counter_sessions SET expires_at=now()+interval '1 day';
 UPDATE bar_counter_devices SET active=false;
 BEGIN PERFORM test_use(); RAISE EXCEPTION 'FAIL inactive accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Personal counter PIN required' THEN RAISE; END IF; END;
 UPDATE bar_counter_devices SET active=true,label='';
 BEGIN PERFORM test_use(); RAISE EXCEPTION 'FAIL unnamed accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Personal counter PIN required' THEN RAISE; END IF; END;
 UPDATE bar_counter_devices SET label='Test server';
END $$;
DO $$ BEGIN
 BEGIN PERFORM test_use(_qty=>-1); RAISE EXCEPTION 'FAIL negative accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Enter a quantity above zero' THEN RAISE; END IF; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM bar_counter_club_use('33333333-3333-3333-3333-333333333333','[{"item_id":"77777777-7777-7777-7777-777777777777","quantity":1}]','Test','88888888-8888-8888-8888-888888888888'); RAISE EXCEPTION 'FAIL foreign item accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Stock item not found in this club' THEN RAISE; END IF; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM bar_counter_club_use('33333333-3333-3333-3333-333333333333','[{"item_id":"44444444-4444-4444-4444-444444444444","quantity":1},{"item_id":"66666666-6666-6666-6666-666666666666","quantity":1}]','Test','88888888-8888-8888-8888-888888888888'); RAISE EXCEPTION 'FAIL nonstock accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Choose the stock product%' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM bar_stock_movements) OR (SELECT stock_units FROM bar_items WHERE name='Squash ball')<>10 THEN RAISE EXCEPTION 'FAIL partial basket wrote'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION test_use(uuid,uuid,numeric) TO anon;
SET ROLE anon;
SELECT test_use();
RESET ROLE;
DO $$ DECLARE r jsonb; BEGIN
 r:=test_use();
 IF (r->>'cost')::numeric<>50 OR r->>'staff_name'<>'Test server' THEN RAISE EXCEPTION 'FAIL cost/staff'; END IF;
 IF (SELECT stock_units FROM bar_items WHERE name='Squash ball')<>8 OR (SELECT count(*) FROM bar_stock_movements)<>1 THEN RAISE EXCEPTION 'FAIL retry stock deduction'; END IF;
 IF (SELECT sum(debit) FROM club_journal_entries WHERE account='club_stock_expense')<>50 OR (SELECT sum(credit) FROM club_journal_entries WHERE account='shop_expense')<>50 THEN RAISE EXCEPTION 'FAIL stock expense'; END IF;
 IF (SELECT sum(debit-credit) FROM club_journal_entries)<>0 THEN RAISE EXCEPTION 'FAIL unbalanced journal'; END IF;
 IF NOT EXISTS(SELECT 1 FROM bar_stock_movements WHERE note LIKE '%Serving: Test server%' AND source_id='88888888-8888-8888-8888-888888888888') THEN RAISE EXCEPTION 'FAIL serving audit'; END IF;
 BEGIN PERFORM test_use(_qty=>3); RAISE EXCEPTION 'FAIL mismatched retry accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Club-sponsored retry does not match' THEN RAISE; END IF; END;
 IF has_function_privilege('anon','_bar_club_use_post(uuid,numeric,text,uuid,text)','EXECUTE') OR has_table_privilege('anon','bar_club_use_requests','SELECT') THEN RAISE EXCEPTION 'FAIL private access exposed'; END IF;
END $$;
DO $$ BEGIN
 PERFORM set_config('test.uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
 PERFORM bar_club_use('55555555-5555-5555-5555-555555555555',1,'Signed-in use');
 IF (SELECT stock_units FROM bar_items WHERE name='Water')<>9 OR (SELECT sum(credit) FROM club_journal_entries WHERE account='bar_expense')<>5 THEN RAISE EXCEPTION 'FAIL signed-in regression'; END IF;
END $$;