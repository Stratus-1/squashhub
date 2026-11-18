-- Approve/decline family package requests from a direct link (email or in-app
-- notice). The page reads the request through an approver-only context RPC and
-- decides through the unchanged family_review_addition writer.

CREATE OR REPLACE FUNCTION public.family_request_review_context(_family_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.club_family_members%ROWTYPE; g public.club_family_groups%ROWTYPE;
  club_name text; p_name text; t_name text; t_email text; t_phone text; t_number text;
BEGIN
IF auth.uid() IS NULL THEN RETURN jsonb_build_object('state','signed_out'); END IF;
SELECT * INTO f FROM public.club_family_members WHERE id=_family_member_id;
IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found'); END IF;
SELECT * INTO g FROM public.club_family_groups WHERE id=f.family_group_id;
SELECT name INTO club_name FROM public.clubs WHERE id=g.club_id;
IF NOT (COALESCE(public.is_club_admin(auth.uid(),g.club_id),false)
        OR COALESCE(public.has_club_permission(auth.uid(),g.club_id,'members'),false)) THEN
  RETURN jsonb_build_object('state','forbidden','club_name',club_name);
END IF;
SELECT name INTO p_name FROM public.club_members WHERE id=g.primary_member_id;
SELECT name, email, phone, club_member_number INTO t_name, t_email, t_phone, t_number
  FROM public.club_members WHERE id=f.club_member_id;
RETURN jsonb_build_object(
  'state', CASE WHEN f.status='invited' AND f.approval_status='pending' THEN 'pending'
                WHEN f.approval_status='approved' THEN 'approved'
                WHEN f.approval_status='rejected' THEN 'declined'
                ELSE 'closed' END,
  'club_id', g.club_id, 'club_name', club_name,
  'primary_name', p_name, 'member_name', t_name,
  'member_email', t_email, 'member_phone', t_phone, 'member_number', t_number,
  'relationship', f.relationship, 'is_new_member', f.is_new_member,
  'accepted', f.accepted_at IS NOT NULL, 'requested_at', f.created_at,
  'decided_at', f.approved_at);
END; $function$;

REVOKE ALL ON FUNCTION public.family_request_review_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_request_review_context(uuid) TO authenticated, service_role;

-- Officials' email now links straight to the approve page; _resend sends a
-- reminder to every official again (still once per address per call).
DROP FUNCTION IF EXISTS public._family_request_email_officials(uuid);

CREATE OR REPLACE FUNCTION public._family_request_email_officials(_family_member_id uuid, _resend boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.club_family_members%ROWTYPE; g public.club_family_groups%ROWTYPE;
  p_name text; t_name text; rel text; n int;
BEGIN
SELECT * INTO f FROM public.club_family_members WHERE id=_family_member_id;
IF NOT FOUND OR f.status<>'invited' OR f.approval_status<>'pending' THEN RETURN 0; END IF;
SELECT * INTO g FROM public.club_family_groups WHERE id=f.family_group_id;
SELECT name INTO p_name FROM public.club_members WHERE id=g.primary_member_id;
SELECT name INTO t_name FROM public.club_members WHERE id=f.club_member_id;
rel := NULLIF(lower(trim(f.relationship)),'');
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
    CASE WHEN _resend THEN 'Reminder: family package request needs approval'
         ELSE 'Family package request needs approval' END,
    COALESCE(p_name,'A member')||' wants to add '||COALESCE(t_name,'someone')
      ||CASE WHEN rel IS NOT NULL THEN ' ('||rel||')' ELSE '' END
      ||' to their family package. '
      ||CASE WHEN f.is_new_member THEN 'This person is new to the club. '
             WHEN f.accepted_at IS NOT NULL THEN 'They have already accepted. '
             ELSE 'They still need to accept in their own account. ' END
      ||'Tap the button below to approve or decline it — you will be asked to sign in. '
      ||'Only club admins and people with members access can approve.',
    '/family-request/'||f.id::text, 'Approve or decline', 'family_request_approval', f.id
  FROM officials o
  WHERE _resend OR NOT EXISTS (SELECT 1 FROM public.email_outbox x WHERE x.kind='family_request_approval'
                    AND x.ref_id=f.id AND lower(x.recipient_email)=lower(o.email))
  RETURNING 1
) SELECT count(*) INTO n FROM ins;
RETURN n;
END; $function$;

REVOKE EXECUTE ON FUNCTION public._family_request_email_officials(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._family_request_email_officials(uuid, boolean) TO service_role;

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
     THEN 'New to the club. '
     ELSE 'Already a club member. ' END
  ||'Tap to approve or decline.',
  '/family-request/'||row_id::text,
  jsonb_build_object('club_member_id',target,'club_id',p.club_id,'family_member_id',row_id,'primary_member_id',p.id,'family_request',true)
FROM public.club_members cm
WHERE cm.club_id=p.club_id AND cm.user_id IS NOT NULL AND cm.id<>target
  AND (cm.role='admin' OR public.has_club_permission(cm.user_id,p.club_id,'members'));
-- Email every admin, member-approver and office bearer as well (best effort:
-- an email problem must never block the family request itself).
BEGIN PERFORM public._family_request_email_officials(row_id);
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'family request email queue failed: %', SQLERRM; END;
RETURN row_id; END; $function$;

-- Existing in-app notices for requests still waiting open the approve page too.
UPDATE public.notifications n SET url='/family-request/'||(n.data->>'family_member_id')
WHERE n.type='membership_application' AND (n.data->>'family_request')='true'
  AND EXISTS (SELECT 1 FROM public.club_family_members f
              WHERE f.id::text=n.data->>'family_member_id' AND f.status='invited' AND f.approval_status='pending');