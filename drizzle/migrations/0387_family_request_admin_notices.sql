-- Family additions get their own clearly labelled admin notice (sent by
-- family_add_member once the family link exists), so the generic
-- "New membership application" alert skips rows created by a family request.
CREATE OR REPLACE FUNCTION public.notify_club_admins_of_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('app.family_add', true), '') = '1'
     OR EXISTS (SELECT 1 FROM public.club_family_members f
                WHERE f.club_member_id = NEW.id AND f.status <> 'removed') THEN
    RETURN NEW;
  END IF;
  -- Alert admins only once the applicant has finished the signup steps
  -- (a fee category is saved) — never at bare account creation.
  IF NEW.is_pending_approval AND NEW.fee_category_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.fee_category_id IS NULL) THEN
    INSERT INTO public.notifications (user_id, type, title, message, url, data)
    SELECT DISTINCT cm.user_id, 'membership_application',
           'New membership application',
           COALESCE(NEW.name, 'A new applicant') || ' has applied to join the club.',
           '/club-admin?tab=members&filter=pending',
           jsonb_build_object('club_member_id', NEW.id, 'club_id', NEW.club_id)
    FROM public.club_members cm
    WHERE cm.club_id = NEW.club_id
      AND cm.user_id IS NOT NULL
      AND cm.id <> NEW.id
      AND (cm.role = 'admin' OR public.has_club_permission(cm.user_id, NEW.club_id, 'members'));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.family_add_member(_primary_member_id uuid, _existing_member_id uuid, _name text, _email text, _phone text, _relationship text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p public.club_members%ROWTYPE; c public.member_fee_categories%ROWTYPE; g public.club_family_groups%ROWTYPE; target uuid; row_id uuid; n int; target_name text; rel text;
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
-- Tell the people who can approve it that this is a family package request,
-- who asked, and how the person is related (new and existing members alike).
SELECT name INTO target_name FROM public.club_members WHERE id=target;
rel := NULLIF(lower(trim(_relationship)),'');
INSERT INTO public.notifications(user_id,type,title,message,url,data)
SELECT DISTINCT cm.user_id,'membership_application','Family package request',
  COALESCE(p.name,'A member')||' wants to add '||COALESCE(target_name,'someone')
  ||CASE WHEN rel IS NOT NULL THEN ' ('||rel||')' ELSE '' END
  ||' to their family package. '
  ||CASE WHEN _existing_member_id IS NULL
     THEN 'New to the club — approve under Members → Membership applications.'
     ELSE 'Already a club member — approve under Fees → Family package.' END,
  CASE WHEN _existing_member_id IS NULL THEN '/club-admin?tab=members&filter=pending' ELSE '/club-admin?tab=fees' END,
  jsonb_build_object('club_member_id',target,'club_id',p.club_id,'family_member_id',row_id,'primary_member_id',p.id,'family_request',true)
FROM public.club_members cm
WHERE cm.club_id=p.club_id AND cm.user_id IS NOT NULL AND cm.id<>target
  AND (cm.role='admin' OR public.has_club_permission(cm.user_id,p.club_id,'members'));
RETURN row_id; END; $function$;