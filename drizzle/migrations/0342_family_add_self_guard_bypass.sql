CREATE OR REPLACE FUNCTION public.club_members_guard_self_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := auth.uid();
  is_admin boolean;
  v_open boolean;
  v_mode text;
  v_auto_number boolean;
  v_has_admin boolean;
  v_activation_claim boolean := coalesce(current_setting('app.activation_claim', true), '') = '1';
  v_self_application boolean := false;
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;

  -- Family package additions are pending member rows created by
  -- family_add_member; they are not self sign-up applications and must keep
  -- the role, category and pending-approval state the RPC set.
  IF TG_OP = 'INSERT' AND coalesce(current_setting('app.family_add', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  is_admin := public.is_club_admin(actor, COALESCE(NEW.club_id, OLD.club_id))
              OR public.has_role(actor, 'admin'::app_role)
              OR (TG_OP = 'UPDATE' AND public.is_club_member_manager(actor, OLD.club_id, OLD.user_id) AND OLD.role <> 'admin'::club_member_role);
  IF is_admin THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM actor THEN RETURN NEW; END IF;
    SELECT c.public_applications_enabled, c.member_activation_mode, c.auto_number_existing_onboarding
      INTO v_open, v_mode, v_auto_number FROM public.clubs c WHERE c.id = NEW.club_id;
    IF v_open IS NULL THEN RAISE EXCEPTION 'Club not found'; END IF;
    IF v_open = false THEN
      RAISE EXCEPTION 'This club is not accepting membership applications. Please contact the club directly.' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.club_members a
                   WHERE a.club_id = NEW.club_id AND a.role = 'admin' AND a.user_id IS NOT NULL)
      INTO v_has_admin;

    NEW.role := CASE WHEN v_has_admin THEN 'member'::club_member_role ELSE 'admin'::club_member_role END;
    NEW.billing_exempt := false;
    NEW.suspension_status := 'active'::member_suspension_status;
    NEW.suspension_outstanding := 0;
    NEW.suspension_manual := false;
    NEW.suspended_at := NULL;
    NEW.suspension_cleared_at := NULL;
    NEW.suspension_reason := NULL;
    NEW.access_suspended_at := NULL;
    NEW.ranking_points := 0;
    NEW.ladder_position := NULL;
    NEW.club_member_number := CASE WHEN COALESCE(v_auto_number, false) THEN public.allocate_next_member_number(NEW.club_id) ELSE NULL END;
    NEW.status := 'active'::member_status;
    NEW.pending_captain_claim := COALESCE(NEW.pending_captain_claim, false);
    NEW.applied_at := now();
    NEW.is_pending_approval := v_has_admin AND (COALESCE(v_mode, 'auto_on_payment') <> 'immediate');
    NEW.approved_at := CASE WHEN NEW.is_pending_approval THEN NULL ELSE now() END;
    NEW.approved_by := NULL;
    RETURN NEW;
  END IF;

  -- A person's own unfinished signup application may choose its FIRST fee
  -- category (the signup steps). Assigned categories stay locked, and imported
  -- / admin-created members can never pick one themselves.
  IF OLD.user_id = actor AND OLD.fee_category_id IS NULL AND NEW.fee_category_id IS NOT NULL THEN
    SELECT (OLD.is_pending_approval OR OLD.applied_at IS NOT NULL
            OR abs(extract(epoch FROM (OLD.joined_at - u.created_at))) < 600)
      INTO v_self_application
      FROM auth.users u WHERE u.id = actor;
    v_self_application := COALESCE(v_self_application, false)
      AND EXISTS (SELECT 1 FROM public.member_fee_categories f
                  WHERE f.id = NEW.fee_category_id AND f.club_id = OLD.club_id);
  END IF;

  SELECT c.auto_number_existing_onboarding INTO v_auto_number FROM public.clubs c WHERE c.id = OLD.club_id;
  NEW.club_id := OLD.club_id;
  NEW.user_id := CASE
    WHEN v_activation_claim AND OLD.user_id IS NULL AND NEW.user_id = actor THEN NEW.user_id
    ELSE OLD.user_id END;
  NEW.role := OLD.role;
  NEW.status := OLD.status;
  NEW.club_member_number := CASE
    WHEN OLD.club_member_number IS NULL AND COALESCE(v_auto_number, false) AND NEW.user_id = actor
    THEN public.allocate_next_member_number(OLD.club_id) ELSE OLD.club_member_number END;
  NEW.fee_category_id := CASE WHEN v_self_application THEN NEW.fee_category_id ELSE OLD.fee_category_id END;
  NEW.billing_exempt := OLD.billing_exempt;
  NEW.suspension_status := OLD.suspension_status;
  NEW.suspension_outstanding := OLD.suspension_outstanding;
  NEW.suspension_reason := OLD.suspension_reason;
  NEW.suspension_manual := OLD.suspension_manual;
  NEW.suspended_at := OLD.suspended_at;
  NEW.suspension_cleared_at := OLD.suspension_cleared_at;
  NEW.access_suspended_at := OLD.access_suspended_at;
  NEW.ranking_points := OLD.ranking_points;
  NEW.ladder_position := OLD.ladder_position;
  NEW.person_id := OLD.person_id;
  NEW.is_league_only_membership := OLD.is_league_only_membership;
  NEW.enable_league_association_id := OLD.enable_league_association_id;
  NEW.joined_at := OLD.joined_at;
  NEW.face_provisioned_at := OLD.face_provisioned_at;
  NEW.face_provider_person_id := OLD.face_provider_person_id;
  NEW.is_pending_approval := OLD.is_pending_approval;
  NEW.applied_at := OLD.applied_at;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.family_add_member(_primary_member_id uuid, _existing_member_id uuid, _name text, _email text, _phone text, _relationship text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
-- Mark this as a family addition so the self sign-up field guard leaves the
-- pending member row exactly as written here (role, category, approval).
PERFORM set_config('app.family_add','1',true);
INSERT INTO public.club_members(club_id,name,email,phone,role,fee_category_id,is_pending_approval) VALUES(p.club_id,trim(_name),NULLIF(trim(_email),''),NULLIF(trim(_phone),''),'member',c.family_additional_category_id,true) RETURNING id INTO target;
END IF;
IF target=p.id THEN RAISE EXCEPTION 'The primary member is already on the package'; END IF;
IF EXISTS(SELECT 1 FROM public.club_family_members WHERE club_member_id=target AND status<>'removed') THEN RAISE EXCEPTION 'That person is already linked to a family package'; END IF;
INSERT INTO public.club_family_members(family_group_id,club_member_id,relationship,status,approval_status,is_new_member,accepted_at) VALUES(g.id,target,NULLIF(trim(_relationship),''),'invited','pending',_existing_member_id IS NULL,CASE WHEN _existing_member_id IS NULL THEN now() END) RETURNING id INTO row_id;
IF _existing_member_id IS NOT NULL THEN INSERT INTO public.notifications(user_id,club_member_id,title,message,type,url) SELECT user_id,id,'Family package request',COALESCE(p.name,'A member')||' would like to add you to their family package. Accept or decline in My Account; club admin approval is also required.','general','/my-account' FROM public.club_members WHERE id=target; END IF;
RETURN row_id; END; $function$;