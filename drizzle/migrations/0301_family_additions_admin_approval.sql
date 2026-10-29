ALTER TABLE public.club_family_members ADD COLUMN approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending','approved','rejected')), ADD COLUMN is_new_member boolean NOT NULL DEFAULT false, ADD COLUMN accepted_at timestamptz, ADD COLUMN approved_by uuid, ADD COLUMN approved_at timestamptz;
COMMENT ON COLUMN public.club_family_members.approval_status IS 'Existing families stay approved; new additions require club membership administrator approval.';
DROP POLICY "Family member can accept or decline own invite" ON public.club_family_members;
CREATE OR REPLACE FUNCTION public.guard_family_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_club uuid;
BEGIN
SELECT club_id INTO v_club FROM public.club_family_groups WHERE id=NEW.family_group_id;
IF TG_OP='INSERT' THEN NEW.approval_status:='pending'; NEW.approved_at:=NULL; NEW.approved_by:=NULL;
ELSIF (NEW.approval_status IS DISTINCT FROM OLD.approval_status OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) AND NOT (COALESCE(public.is_club_admin(auth.uid(),v_club),false) OR COALESCE(public.has_club_permission(auth.uid(),v_club,'members'),false)) THEN RAISE EXCEPTION 'Only club membership administrators may approve family additions' USING ERRCODE='42501'; END IF;
IF NEW.status='active' AND NEW.approval_status<>'approved' THEN RAISE EXCEPTION 'Family addition requires club admin approval'; END IF;
RETURN NEW; END; $$;
CREATE TRIGGER guard_family_approval BEFORE INSERT OR UPDATE ON public.club_family_members FOR EACH ROW EXECUTE FUNCTION public.guard_family_approval();
CREATE OR REPLACE FUNCTION public.family_add_member(_primary_member_id uuid, _existing_member_id uuid, _name text, _email text, _phone text, _relationship text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.club_members%ROWTYPE; c public.member_fee_categories%ROWTYPE; g public.club_family_groups%ROWTYPE; target uuid; row_id uuid; n int;
BEGIN
SELECT * INTO p FROM public.club_members WHERE id=_primary_member_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Primary member not found'; END IF;
IF auth.uid() IS NULL OR NOT (COALESCE(p.user_id=auth.uid(),false) OR COALESCE(public.is_club_admin(auth.uid(),p.club_id),false)) THEN RAISE EXCEPTION 'Not allowed to manage this family' USING ERRCODE='42501'; END IF;
SELECT * INTO c FROM public.member_fee_categories WHERE id=p.fee_category_id AND club_id=p.club_id;
IF NOT FOUND OR COALESCE(c.family_role,'')<>'primary' THEN RAISE EXCEPTION 'This member is not on a Family Package'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.member_fee_categories WHERE id=c.family_additional_category_id AND club_id=p.club_id) THEN RAISE EXCEPTION 'Club has not set an Additional Family Member category'; END IF;
IF COALESCE(cardinality(c.family_allowed_relationships),0)>0 AND NOT COALESCE(_relationship=ANY(c.family_allowed_relationships),false) THEN RAISE EXCEPTION 'Your club does not include that relationship in the family package'; END IF;
SELECT * INTO g FROM public.club_family_groups WHERE club_id=p.club_id AND primary_member_id=p.id AND season_year=EXTRACT(year FROM now())::int FOR UPDATE;
IF NOT FOUND THEN INSERT INTO public.club_family_groups(club_id,primary_member_id,season_year) VALUES(p.club_id,p.id,EXTRACT(year FROM now())::int) RETURNING * INTO g; END IF;
SELECT count(*) INTO n FROM public.club_family_members WHERE family_group_id=g.id AND status<>'removed' AND club_member_id<>p.id;
IF c.family_max_additional IS NOT NULL AND n>=c.family_max_additional THEN RAISE EXCEPTION 'This family package is full'; END IF;
IF _existing_member_id IS NOT NULL THEN SELECT id INTO target FROM public.club_members WHERE id=_existing_member_id AND club_id=p.club_id; IF target IS NULL THEN RAISE EXCEPTION 'Member not found in this club'; END IF;
ELSE
IF COALESCE(trim(_name),'')='' THEN RAISE EXCEPTION 'Name is required'; END IF;
INSERT INTO public.club_members(club_id,name,email,phone,role,fee_category_id,is_pending_approval) VALUES(p.club_id,trim(_name),NULLIF(trim(_email),''),NULLIF(trim(_phone),''),'member',c.family_additional_category_id,true) RETURNING id INTO target;
END IF;
IF target=p.id THEN RAISE EXCEPTION 'The primary member is already on the package'; END IF;
IF EXISTS(SELECT 1 FROM public.club_family_members WHERE club_member_id=target AND status<>'removed') THEN RAISE EXCEPTION 'That person is already linked to a family package'; END IF;
INSERT INTO public.club_family_members(family_group_id,club_member_id,relationship,status,approval_status,is_new_member,accepted_at) VALUES(g.id,target,NULLIF(trim(_relationship),''),'invited','pending',_existing_member_id IS NULL,CASE WHEN _existing_member_id IS NULL THEN now() END) RETURNING id INTO row_id;
IF _existing_member_id IS NOT NULL THEN INSERT INTO public.notifications(user_id,club_member_id,title,message,type,url) SELECT user_id,id,'Family package request',COALESCE(p.name,'A member')||' would like to add you to their family package. Accept or decline in My Account; club admin approval is also required.','general','/my-account' FROM public.club_members WHERE id=target; END IF;
RETURN row_id; END; $$;
DO $migration$
DECLARE s text; a int; b int;
BEGIN
-- Preserve the existing canonical fee/payer writer, but make it a private approved-only action.
SELECT pg_get_functiondef(oid) INTO s FROM pg_proc WHERE oid='public.family_respond_invite(uuid,boolean)'::regprocedure;
s:=replace(s,'public.family_respond_invite(_family_member_id uuid, _accept boolean)','public.family_activate_approved(_family_member_id uuid)');
a:=strpos(s,'  IF NOT (v_member.user_id'); b:=strpos(s,'  SELECT * INTO v_cat');
IF a=0 OR b<a THEN RAISE EXCEPTION 'Unexpected family acceptance definition'; END IF;
s:=substr(s,1,a-1)|| E'  IF v_row.approval_status <> ''approved'' OR v_row.accepted_at IS NULL THEN\n    RAISE EXCEPTION ''Family addition needs acceptance and admin approval'';\n  END IF;\n  SELECT * INTO v_group FROM public.club_family_groups WHERE id = v_row.family_group_id;\n  SELECT * INTO v_primary FROM public.club_members WHERE id = v_group.primary_member_id;\n' ||substr(s,b);
s:=replace(s,E'WHERE id = _family_member_id;\n\n  UPDATE',E'WHERE id = _family_member_id;\n\n  IF v_row.is_new_member THEN\n    UPDATE public.club_members SET is_pending_approval=false, approved_at=v_row.approved_at, approved_by=v_row.approved_by WHERE id=v_member.id;\n  END IF;\n\n  UPDATE');
EXECUTE s;
END; $migration$;
REVOKE ALL ON FUNCTION public.family_activate_approved(uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.family_respond_invite(_family_member_id uuid,_accept boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.club_family_members%ROWTYPE; m public.club_members%ROWTYPE;
BEGIN
SELECT * INTO r FROM public.club_family_members WHERE id=_family_member_id FOR UPDATE;
IF NOT FOUND OR r.status<>'invited' THEN RAISE EXCEPTION 'This request is no longer pending'; END IF;
SELECT * INTO m FROM public.club_members WHERE id=r.club_member_id;
IF auth.uid() IS NULL OR NOT COALESCE(m.user_id=auth.uid(),false) THEN RAISE EXCEPTION 'Only the invited member can respond' USING ERRCODE='42501'; END IF;
IF NOT _accept THEN UPDATE public.club_family_members SET status='removed',removed_at=now(),updated_at=now() WHERE id=r.id; RETURN false; END IF;
UPDATE public.club_family_members SET accepted_at=now(),updated_at=now() WHERE id=r.id;
IF r.approval_status='approved' THEN PERFORM public.family_activate_approved(r.id); END IF;
RETURN true; END; $$;
CREATE OR REPLACE FUNCTION public.family_review_addition(_family_member_id uuid,_approve boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.club_family_members%ROWTYPE; g public.club_family_groups%ROWTYPE;
BEGIN
SELECT * INTO r FROM public.club_family_members WHERE id=_family_member_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Family request not found'; END IF;
SELECT * INTO g FROM public.club_family_groups WHERE id=r.family_group_id;
IF auth.uid() IS NULL OR NOT (COALESCE(public.is_club_admin(auth.uid(),g.club_id),false) OR COALESCE(public.has_club_permission(auth.uid(),g.club_id,'members'),false)) THEN RAISE EXCEPTION 'Not authorised to approve family additions' USING ERRCODE='42501'; END IF;
IF r.approval_status<>'pending' OR r.status<>'invited' THEN RAISE EXCEPTION 'This family request is no longer pending'; END IF;
UPDATE public.club_family_members SET approval_status=CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,approved_by=auth.uid(),approved_at=now(),status=CASE WHEN _approve THEN status ELSE 'removed' END,removed_at=CASE WHEN _approve THEN removed_at ELSE now() END,updated_at=now() WHERE id=r.id;
IF _approve AND r.accepted_at IS NOT NULL THEN PERFORM public.family_activate_approved(r.id); END IF;
RETURN _approve; END; $$;
REVOKE ALL ON FUNCTION public.family_review_addition(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.family_review_addition(uuid,boolean) TO authenticated;
DO $migration$
DECLARE s text;
BEGIN
SELECT pg_get_functiondef(oid) INTO s FROM pg_proc WHERE oid='public.review_membership_application(uuid,boolean)'::regprocedure;
s:=replace(s,E'  IF _approve THEN\n',E'  IF EXISTS (SELECT 1 FROM public.club_family_members WHERE club_member_id=_member_id AND is_new_member AND approval_status=''pending'' AND status=''invited'') THEN\n    PERFORM public.family_review_addition(id,_approve) FROM public.club_family_members WHERE club_member_id=_member_id AND is_new_member AND approval_status=''pending'' AND status=''invited'';\n    RETURN;\n  END IF;\n  IF _approve AND EXISTS (SELECT 1 FROM public.club_family_members WHERE club_member_id=_member_id AND is_new_member AND approval_status=''rejected'') THEN\n    RAISE EXCEPTION ''The family application was rejected; submit a new application before approving'';\n  END IF;\n  IF _approve THEN\n');
EXECUTE s;
END; $migration$;