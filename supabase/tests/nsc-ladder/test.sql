INSERT INTO clubs VALUES ('061e6dd9-0ec2-4427-a939-3f18ad0884c8',true,5);
INSERT INTO ladder_configs(id,club_id,format,movement_policy,affects_club_ranking,ladder_auto_apply,max_active_outgoing,max_active_incoming,rematch_cooldown_days,pyramid_allow_same_row) VALUES(gen_random_uuid(),'061e6dd9-0ec2-4427-a939-3f18ad0884c8','pyramid','insert',true,true,1,1,0,true);
INSERT INTO club_members(id,club_id,gender,ladder_position) VALUES
('00000000-0000-0000-0000-000000000001','061e6dd9-0ec2-4427-a939-3f18ad0884c8','male',70),
('00000000-0000-0000-0000-000000000002','061e6dd9-0ec2-4427-a939-3f18ad0884c8','female',68),
('00000000-0000-0000-0000-000000000003','061e6dd9-0ec2-4427-a939-3f18ad0884c8','male',69);
INSERT INTO challenges(id,club_id,challenger_member_id,opponent_member_id) VALUES(gen_random_uuid(),'061e6dd9-0ec2-4427-a939-3f18ad0884c8','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
INSERT INTO matches(id,club_id,confirmed,source_type,winner_member_id,player_a_member_id,player_b_member_id) VALUES('00000000-0000-0000-0000-000000000010','061e6dd9-0ec2-4427-a939-3f18ad0884c8',false,'ladder','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
DO $$ BEGIN
 IF (select ladder_position from club_members where id='00000000-0000-0000-0000-000000000001')<>70 OR (select count(*) from award_calls)<>0 THEN RAISE EXCEPTION 'Pending result changed ladder'; END IF;
END $$;
UPDATE matches SET confirmed=true WHERE id='00000000-0000-0000-0000-000000000010';
DO $$ BEGIN
 IF (select ladder_position from club_members where id='00000000-0000-0000-0000-000000000001')<>68 THEN RAISE EXCEPTION 'Winner must move 70 to 68'; END IF;
 IF (select ladder_position from club_members where id='00000000-0000-0000-0000-000000000002')<>69 THEN RAISE EXCEPTION 'Mixed loser must shift to 69'; END IF;
 IF (select ladder_position from club_members where id='00000000-0000-0000-0000-000000000003')<>70 THEN RAISE EXCEPTION 'Intermediate must shift to 70'; END IF;
 IF (select count(*) from award_calls)<>1 THEN RAISE EXCEPTION 'Exactly one award expected'; END IF;
END $$;
UPDATE matches SET confirmed=true WHERE id='00000000-0000-0000-0000-000000000010';
UPDATE matches SET confirmed=false WHERE id='00000000-0000-0000-0000-000000000010';
UPDATE matches SET confirmed=true WHERE id='00000000-0000-0000-0000-000000000010';
DO $$ BEGIN IF (select count(*) from award_calls)<>1 THEN RAISE EXCEPTION 'Repeated confirmation awarded twice'; END IF; END $$;
INSERT INTO matches(id,club_id,confirmed,source_type,winner_member_id,player_a_member_id,player_b_member_id) VALUES(gen_random_uuid(),'061e6dd9-0ec2-4427-a939-3f18ad0884c8',true,'friendly','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
DO $$ BEGIN IF (select count(*) from award_calls)<>1 THEN RAISE EXCEPTION 'Friendly awarded ladder effects'; END IF; END $$;
SELECT 'NSC ladder SQL checks passed' as result;
