INSERT INTO clubs(id) VALUES('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
INSERT INTO club_members VALUES('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','member'),('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','member'),('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','cccccccc-cccc-cccc-cccc-cccccccccccc','captain');
INSERT INTO club_permission_roles VALUES('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','Chairman'),('77777777-7777-7777-7777-777777777777','11111111-1111-1111-1111-111111111111','Club Captain');
UPDATE clubs SET vice_chairman_member_id='33333333-3333-3333-3333-333333333333',club_manager_member_id='44444444-4444-4444-4444-444444444444' WHERE id='11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
 IF NOT is_club_chairman('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111') THEN RAISE EXCEPTION 'Vice Chairman parity failed'; END IF;
 IF is_club_chairman('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111') THEN RAISE EXCEPTION 'Manager incorrectly chairman'; END IF;
 IF NOT is_club_admin('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111') THEN RAISE EXCEPTION 'Manager admin parity failed'; END IF;
 IF is_club_admin('cccccccc-cccc-cccc-cccc-cccccccccccc','22222222-2222-2222-2222-222222222222') THEN RAISE EXCEPTION 'Team captain escalated'; END IF;
 IF is_club_chairman('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222') THEN RAISE EXCEPTION 'Cross club permission leaked'; END IF;
 IF (SELECT permission_role_id FROM club_member_permissions WHERE club_member_id='44444444-4444-4444-4444-444444444444') IS DISTINCT FROM '77777777-7777-7777-7777-777777777777'::uuid THEN RAISE EXCEPTION 'Manager role assignment failed'; END IF;
 IF chairman_banking_setup_change_allowed('clubs','UPDATE','{"vice_chairman_member_id":null}','{"vice_chairman_member_id":"33333333-3333-3333-3333-333333333333"}') THEN RAISE EXCEPTION 'Vice Chairman removal bypass'; END IF;
 BEGIN UPDATE clubs SET club_manager_member_id='55555555-5555-5555-5555-555555555555' WHERE id='11111111-1111-1111-1111-111111111111'; RAISE EXCEPTION 'Foreign member accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='Foreign member accepted' THEN RAISE; END IF; END;
END $$;
INSERT INTO office_role_defaults VALUES('chairman','Chairman'),('club_captain','Club Captain');
INSERT INTO club_offices VALUES('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','vice_chair',null),('11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444','club_manager',null);
DO $$ BEGIN IF NOT new_model_cap('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Chairman') OR NOT new_model_cap('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','Club Captain') THEN RAISE EXCEPTION 'Detailed office parity failed'; END IF; END $$;
