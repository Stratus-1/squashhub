CREATE TRIGGER test_signup AFTER INSERT ON public.test_auth_users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO public.clubs VALUES ('00000000-0000-0000-0000-000000000001', 'signed', now()), ('00000000-0000-0000-0000-000000000002', 'unsigned', null);
INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-000000000010', 'Applicant', 'applicant@example.test', null);
INSERT INTO public.club_members(club_id,user_id,name,person_id) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','Applicant','00000000-0000-0000-0000-000000000099');
SELECT set_config('test.uid', '00000000-0000-0000-0000-000000000010', false);
DO $$ BEGIN
  IF public.club_accepts_membership_applications('00000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'Unsigned allowed'; END IF;
  IF NOT public.club_accepts_membership_applications('00000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'Signed refused'; END IF;
  BEGIN
    PERFORM public.apply_to_club_as_existing_person('00000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'Second-club application unexpectedly allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'APPLICATIONS_UNAVAILABLE:%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.join_club_request('00000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'Join unexpectedly allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'APPLICATIONS_UNAVAILABLE:%' THEN RAISE; END IF; END;
  IF EXISTS (SELECT 1 FROM public.club_members WHERE club_id='00000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'Unsigned membership created'; END IF;
END $$;
-- Signup remains usable, but an unlinked applicant must not get a membership.
INSERT INTO public.test_auth_users VALUES ('00000000-0000-0000-0000-000000000020', 'new@example.test', '{"name":"New Applicant","club_subdomain":"unsigned","club_registration_type":"club_member"}');
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.club_members WHERE user_id='00000000-0000-0000-0000-000000000020') THEN RAISE EXCEPTION 'Unsigned signup created membership'; END IF;
END $$;
-- Existing imported member activation still links the same row at an unsigned club.
INSERT INTO public.club_members(club_id,name,email,club_member_number) VALUES ('00000000-0000-0000-0000-000000000002','Existing','existing@example.test','EX123');
INSERT INTO public.test_auth_users VALUES ('00000000-0000-0000-0000-000000000030', 'existing@example.test', '{"name":"EX123","club_subdomain":"unsigned","club_registration_type":"club_member"}');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.club_members WHERE club_id='00000000-0000-0000-0000-000000000002') <> 1 THEN RAISE EXCEPTION 'Existing activation changed membership count'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.club_members WHERE club_member_number='EX123' AND user_id='00000000-0000-0000-0000-000000000030') THEN RAISE EXCEPTION 'Existing activation blocked'; END IF;
END $$;
-- A signed club still accepts a new signup.
INSERT INTO public.test_auth_users VALUES ('00000000-0000-0000-0000-000000000040', 'signed-new@example.test', '{"name":"Signed Applicant","club_subdomain":"signed","club_registration_type":"club_member"}');
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.club_members WHERE user_id='00000000-0000-0000-0000-000000000040' AND is_pending_approval) THEN RAISE EXCEPTION 'Signed application blocked'; END IF;
END $$;
SET ROLE anon;
SELECT public.club_accepts_membership_applications('00000000-0000-0000-0000-000000000001');
RESET ROLE;
-- Unexpired active trials accept applications without an SLA; expired/cancelled trials do not.
INSERT INTO public.clubs VALUES
 ('00000000-0000-0000-0000-000000000003','trial',null),
 ('00000000-0000-0000-0000-000000000004','expired',null),
 ('00000000-0000-0000-0000-000000000005','cancelled',null),
 ('ec323faa-9b1f-4603-9b30-a0db787ada99','stjohns',null);
INSERT INTO public.club_subscriptions VALUES
 ('00000000-0000-0000-0000-000000000003','active',now()+interval '1 day'),
 ('00000000-0000-0000-0000-000000000004','active',now()-interval '1 day'),
 ('00000000-0000-0000-0000-000000000005','cancelled',now()+interval '1 day');
DO $$ BEGIN
 IF NOT public.club_accepts_membership_applications('00000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'Active trial blocked'; END IF;
 IF public.club_accepts_membership_applications('00000000-0000-0000-0000-000000000004') THEN RAISE EXCEPTION 'Expired trial allowed'; END IF;
 IF public.club_accepts_membership_applications('00000000-0000-0000-0000-000000000005') THEN RAISE EXCEPTION 'Cancelled trial allowed'; END IF;
 IF NOT public.club_accepts_membership_applications('ec323faa-9b1f-4603-9b30-a0db787ada99') THEN RAISE EXCEPTION 'Owner-approved St Johns blocked'; END IF;
 PERFORM public.apply_to_club_as_existing_person('00000000-0000-0000-0000-000000000003');
 IF NOT EXISTS(SELECT 1 FROM public.club_members WHERE club_id='00000000-0000-0000-0000-000000000003' AND user_id=auth.uid() AND is_pending_approval) THEN RAISE EXCEPTION 'Trial application not saved'; END IF;
END $$;