CREATE OR REPLACE FUNCTION public._family_request_email_officials(_family_member_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.club_family_members%ROWTYPE; g public.club_family_groups%ROWTYPE;
  p_name text; t_name text; rel text; link text; where_txt text; n int;
BEGIN
SELECT * INTO f FROM public.club_family_members WHERE id=_family_member_id;
IF NOT FOUND OR f.status<>'invited' OR f.approval_status<>'pending' THEN RETURN 0; END IF;
SELECT * INTO g FROM public.club_family_groups WHERE id=f.family_group_id;
SELECT name INTO p_name FROM public.club_members WHERE id=g.primary_member_id;
SELECT name INTO t_name FROM public.club_members WHERE id=f.club_member_id;
rel := NULLIF(lower(trim(f.relationship)),'');
IF f.is_new_member THEN
  link := '/club-admin?tab=members&filter=pending'; where_txt := 'Club Admin → Members → Membership applications';
ELSE
  link := '/club-admin?tab=fees'; where_txt := 'Club Admin → Fees → Family package';
END IF;
WITH officials AS (
  SELECT DISTINCT ON (lower(trim(cm.email))) cm.id, cm.name, trim(cm.email) AS email
  FROM public.club_members cm
  JOIN public.clubs c ON c.id=cm.club_id
  WHERE cm.club_id=g.club_id AND cm.status='active'
    AND cm.id NOT IN (f.club_member_id, g.primary_member_id)
    AND trim(COALESCE(cm.email,'')) LIKE '%@%'
    AND (cm.role='admin'
      OR (cm.user_id IS NOT NULL AND public.has_club_permission(cm.user_id,g.club_id,'members'))
      OR cm.id IN (c.chairman_member_id,c.vice_chairman_member_id,c.secretary_member_id,
                   c.treasurer_member_id,c.club_captain_member_id,c.club_manager_member_id)
      OR EXISTS (SELECT 1 FROM public.club_offices o WHERE o.club_id=g.club_id
                 AND o.club_member_id=cm.id AND o.ended_at IS NULL))
  ORDER BY lower(trim(cm.email)), cm.id
), ins AS (
  INSERT INTO public.email_outbox(club_id,club_member_id,recipient_email,recipient_name,subject,body,url,cta_label,kind,ref_id)
  SELECT g.club_id, o.id, o.email, o.name,
    'Family package request needs approval',
    COALESCE(p_name,'A member')||' wants to add '||COALESCE(t_name,'someone')
      ||CASE WHEN rel IS NOT NULL THEN ' ('||rel||')' ELSE '' END
      ||' to their family package. '
      ||CASE WHEN f.is_new_member THEN 'This person is new to the club. '
             WHEN f.accepted_at IS NOT NULL THEN 'They have already accepted. '
             ELSE 'They still need to accept in their own account. ' END
      ||'A club admin needs to approve it in the SquashHub app under '||where_txt||'.',
    link, 'Review request', 'family_request_approval', f.id
  FROM officials o
  WHERE NOT EXISTS (SELECT 1 FROM public.email_outbox x WHERE x.kind='family_request_approval'
                    AND x.ref_id=f.id AND lower(x.recipient_email)=lower(o.email))
  RETURNING 1
) SELECT count(*) INTO n FROM ins;
RETURN n;
END; $function$;

REVOKE EXECUTE ON FUNCTION public._family_request_email_officials(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._family_request_email_officials(uuid) TO service_role;

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
-- Email every admin, member-approver and office bearer as well (best effort:
-- an email problem must never block the family request itself).
BEGIN PERFORM public._family_request_email_officials(row_id);
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'family request email queue failed: %', SQLERRM; END;
RETURN row_id; END; $function$;

-- Requests already waiting for approval get the email once too.
SELECT public._family_request_email_officials(f.id)
FROM public.club_family_members f WHERE f.status='invited' AND f.approval_status='pending';