CREATE TABLE public.chairman_action_context (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), backend_pid integer NOT NULL DEFAULT pg_backend_pid(), transaction_id bigint NOT NULL DEFAULT txid_current(), club_id uuid NOT NULL, member_id uuid NOT NULL, registration_id uuid, action text NOT NULL);
GRANT ALL ON public.chairman_action_context TO service_role;
ALTER TABLE public.chairman_action_context ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.chairman_action_context IS 'Private transaction-scoped authority for canonical chairman membership/self-entry actions; no client grants or policies.';
CREATE OR REPLACE FUNCTION public.chairman_automatic_write_allowed(_table text,_op text,j jsonb,o jsonb,cid uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record;
BEGIN
 FOR c IN SELECT * FROM public.chairman_action_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND club_id=cid LOOP
  IF _table='club_member_fee_payments' AND j->>'club_member_id'=c.member_id::text AND NOT coalesce((j->>'paid')::boolean,false) AND j->>'paid_at' IS NULL THEN
   IF _op='INSERT' AND ((c.action='membership' AND j->>'fee_type' IN ('club','registration')) OR (c.action='family' AND j->>'fee_type'='club') OR (c.action='self_entry' AND j->>'fee_type'='tournament_entry')) THEN RETURN true; END IF;
   IF _op='UPDATE' AND NOT coalesce((o->>'paid')::boolean,false) AND j->'club_member_id'=o->'club_member_id' AND j->'fee_type'=o->'fee_type' AND j->'season_year'=o->'season_year' AND NOT EXISTS(SELECT 1 FROM jsonb_each(j) e WHERE e.value IS DISTINCT FROM o->e.key AND NOT e.key=ANY(ARRAY['amount','updated_at','paid_by_member_id','family_group_id'])) AND c.action IN ('self_entry','family') THEN RETURN true; END IF;
  END IF;
  IF _table='club_journal_entries' AND _op='INSERT' AND j->>'club_member_id'=c.member_id::text AND EXISTS(SELECT 1 FROM public.club_member_fee_payments f WHERE f.id=nullif(j->>'fee_payment_id','')::uuid AND f.club_member_id=c.member_id AND NOT f.paid AND ((c.action IN ('membership','family') AND f.fee_type IN ('club','registration')) OR (c.action='self_entry' AND f.fee_type='tournament_entry'))) THEN RETURN true; END IF;
 END LOOP;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.chairman_automatic_write_allowed(text,text,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.guard_chairman_financial_write()'::regprocedure) INTO d;
 IF strpos(d,'IF public.chairman_banking_setup_change_allowed')=0 THEN RAISE EXCEPTION 'Expected chairman guard not found'; END IF;
 d:=replace(d,'IF public.chairman_banking_setup_change_allowed','IF public.chairman_automatic_write_allowed(TG_TABLE_NAME,TG_OP,j,oldj,cid) THEN RETURN COALESCE(NEW,OLD); END IF; IF public.chairman_banking_setup_change_allowed');
 d:=replace(d,'IF TG_OP=''UPDATE'' AND j->''fee_category_id'' IS DISTINCT FROM oldj->''fee_category_id'' THEN RAISE EXCEPTION ''Chairman financial access is view-only'' USING ERRCODE=''42501''; END IF;', 'IF TG_OP=''UPDATE'' AND j->''fee_category_id'' IS DISTINCT FROM oldj->''fee_category_id'' THEN IF NOT public.is_club_admin_or_permitted(auth.uid(),cid,''members'') OR (j->>''fee_category_id'' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.member_fee_categories WHERE id=(j->>''fee_category_id'')::uuid AND club_id=cid)) THEN RAISE EXCEPTION ''Not authorised for this member category'' USING ERRCODE=''42501''; END IF; END IF;');
 EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION public.chairman_ensure_joining_fee(_member_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.club_members%ROWTYPE; c public.member_fee_categories%ROWTYPE; ctx uuid; renew timestamp; joined timestamp; months numeric; n int; yr int; amount numeric; total numeric:=0; label text; f record;
BEGIN
 SELECT * INTO m FROM public.club_members WHERE id=_member_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(),m.club_id,'members') THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
 IF NOT public.is_club_chairman(auth.uid(),m.club_id) THEN RAISE EXCEPTION 'Chairman membership action required' USING ERRCODE='42501'; END IF;
 IF coalesce(m.billing_exempt,false) OR m.role::text='visitor' THEN RETURN jsonb_build_object('raised',false,'amount',0); END IF;
 IF EXISTS(SELECT 1 FROM public.club_family_members WHERE club_member_id=m.id AND is_new_member AND status<>'removed') THEN RETURN jsonb_build_object('raised',false,'amount',0); END IF;
 SELECT * INTO c FROM public.member_fee_categories WHERE id=m.fee_category_id AND club_id=m.club_id;
 IF NOT FOUND OR coalesce(c.annual_fee,0)<=0 OR EXISTS(SELECT 1 FROM public.club_member_fee_payments WHERE club_member_id=m.id AND fee_type IN ('club','membership')) THEN RETURN jsonb_build_object('raised',false,'amount',0); END IF;
 joined:=coalesce(m.joined_at,now()) AT TIME ZONE 'Africa/Johannesburg';
 renew:=make_date(extract(year FROM joined)::int,coalesce(nullif(c.due_month,0),1),coalesce(nullif(c.due_day,0),1))::timestamp;
 IF renew<=joined THEN renew:=renew+interval '1 year'; END IF;
 months:=extract(epoch FROM (renew-joined))/(86400*30.4375);
 yr:=extract(year FROM renew)::int-1;
 IF months<=1 THEN n:=12; amount:=c.annual_fee; yr:=yr+1;
 ELSIF NOT coalesce(c.pro_rate,true) THEN n:=12; amount:=c.annual_fee;
 ELSE n:=least(12,greatest(1,ceil(months)::int)); amount:=round(c.annual_fee*n/12,2); END IF;
 label:='Club Membership ('||c.name||')'||CASE WHEN NOT coalesce(c.pro_rate,true) THEN '' WHEN n=12 THEN ' — Full year (covers next season)' ELSE ' — Pro-rated '||n||' month'||CASE WHEN n=1 THEN '' ELSE 's' END END;
 INSERT INTO public.chairman_action_context(club_id,member_id,action) VALUES(m.club_id,m.id,'membership') RETURNING id INTO ctx;
 INSERT INTO public.club_member_fee_payments(club_member_id,fee_type,fee_label,amount,paid,season_year) VALUES(m.id,'club',label,amount,false,yr);
 total:=amount;
 IF NOT EXISTS(SELECT 1 FROM public.club_member_fee_payments WHERE club_member_id=m.id AND fee_type='registration') THEN
  FOR f IN SELECT * FROM public.national_body_fees WHERE club_id=m.club_id AND fee_type='registration' AND active IS DISTINCT FROM false AND fee_annual>0 LOOP
   INSERT INTO public.club_member_fee_payments(club_member_id,fee_type,fee_label,amount,paid,season_year) VALUES(m.id,'registration',f.body_name||CASE WHEN coalesce(f.abbreviation,'')<>'' THEN ' ('||f.abbreviation||')' ELSE '' END,f.fee_annual,false,yr);
   total:=total+f.fee_annual;
  END LOOP;
 END IF;
 DELETE FROM public.chairman_action_context WHERE id=ctx;
 RETURN jsonb_build_object('raised',true,'amount',total);
END $$;
REVOKE ALL ON FUNCTION public.chairman_ensure_joining_fee(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chairman_ensure_joining_fee(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.chairman_add_member(_club_id uuid,_details jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.club_members%ROWTYPE; mid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_club_chairman(auth.uid(),_club_id) OR NOT public.is_club_admin_or_permitted(auth.uid(),_club_id,'members') THEN RAISE EXCEPTION 'Not authorised' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(_details) AS fields(k) WHERE NOT k=ANY(ARRAY['user_id','name','email','club_member_number','id_number','phone','address','fee_category_id','gender','skill_level','plays_league','role'])) THEN RAISE EXCEPTION 'Unsupported member fields'; END IF;
 m:=jsonb_populate_record(NULL::public.club_members,_details);
 IF coalesce(trim(m.name),'')='' OR coalesce(m.role::text,'member') NOT IN ('member','visitor') THEN RAISE EXCEPTION 'Invalid member'; END IF;
 IF m.fee_category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.member_fee_categories WHERE id=m.fee_category_id AND club_id=_club_id) THEN RAISE EXCEPTION 'Category is not in this club'; END IF;
 IF m.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=m.user_id AND lower(email)=lower(m.email)) THEN RAISE EXCEPTION 'Invalid member account link'; END IF;
 INSERT INTO public.club_members(club_id,user_id,name,email,club_member_number,id_number,phone,address,gender,skill_level,plays_league,role)
 VALUES(_club_id,m.user_id,trim(m.name),m.email,m.club_member_number,m.id_number,m.phone,m.address,m.gender,m.skill_level,coalesce(m.plays_league,false),coalesce(m.role,'member')) RETURNING id INTO mid;
 UPDATE public.club_members SET fee_category_id=m.fee_category_id WHERE id=mid;
 PERFORM public.chairman_ensure_joining_fee(mid);
 RETURN mid;
END $$;
REVOKE ALL ON FUNCTION public.chairman_add_member(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.chairman_add_member(uuid,jsonb) TO authenticated;
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.seed_member_default_fees(uuid)'::regprocedure) INTO d;
 d:=replace(d,'IF NOT FOUND THEN RETURN; END IF;', 'IF NOT FOUND THEN RETURN; END IF; IF public.is_club_chairman(auth.uid(),v_member.club_id) AND NOT public.has_role(auth.uid(),''admin''::public.app_role) THEN RETURN; END IF;'); EXECUTE d;
 SELECT pg_get_functiondef('public.review_membership_application(uuid,boolean)'::regprocedure) INTO d;
 d:=replace(d,E'  IF _approve THEN\n',E'  IF _approve THEN\n    IF public.is_club_chairman(auth.uid(),v_club) THEN PERFORM public.chairman_ensure_joining_fee(_member_id); END IF;\n'); EXECUTE d;
END $$;
DO $$ DECLARE f record; d text; BEGIN
 FOR f IN SELECT * FROM (VALUES ('accept_tournament_invite','_chairman_accept_tournament_invite','uuid,boolean,integer[]'),('charge_tournament_entry_to_account','_chairman_charge_tournament_entry_to_account','uuid'),('family_activate_approved','_chairman_family_activate_approved','uuid')) AS v(original,private_name,args) LOOP
  SELECT pg_get_functiondef(to_regprocedure('public.'||f.original||'('||f.args||')')) INTO d;
  IF d IS NULL THEN RAISE EXCEPTION 'Missing canonical action %',f.original; END IF;
  d:=replace(d,'FUNCTION public.'||f.original||'(','FUNCTION public.'||f.private_name||'('); EXECUTE d;
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,authenticated',f.private_name,f.args);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.chairman_self_entry_context(_registration uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; ctx uuid;
BEGIN
 SELECT cm.user_id,cm.id AS mid,t.club_id INTO r FROM public.club_champs_registrations cr JOIN public.club_members cm ON cm.id=cr.club_member_id JOIN public.tournaments t ON t.id=cr.champ_id WHERE cr.id=_registration FOR UPDATE OF cr;
 IF NOT FOUND OR auth.uid() IS NULL OR r.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorised for this registration' USING ERRCODE='42501'; END IF;
 IF public.is_club_chairman(auth.uid(),r.club_id) THEN INSERT INTO public.chairman_action_context(club_id,member_id,registration_id,action) VALUES(r.club_id,public.resolve_host_billing_member(r.mid,r.club_id),_registration,'self_entry') RETURNING id INTO ctx; END IF;
 RETURN ctx;
END $$;
REVOKE ALL ON FUNCTION public.chairman_self_entry_context(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.accept_tournament_invite(p_registration_id uuid,p_accept boolean,p_divisions integer[] DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx uuid; result jsonb;
BEGIN
 ctx:=public.chairman_self_entry_context(p_registration_id);
 result:=public._chairman_accept_tournament_invite(p_registration_id,p_accept,p_divisions);
 DELETE FROM public.chairman_action_context WHERE id=ctx;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.charge_tournament_entry_to_account(p_registration_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx uuid; result jsonb; cid uuid;
BEGIN
 SELECT t.club_id INTO cid FROM public.club_champs_registrations r JOIN public.tournaments t ON t.id=r.champ_id WHERE r.id=p_registration_id;
 IF public.is_club_chairman(auth.uid(),cid) THEN ctx:=public.chairman_self_entry_context(p_registration_id); END IF;
 result:=public._chairman_charge_tournament_entry_to_account(p_registration_id);
 DELETE FROM public.chairman_action_context WHERE id=ctx;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.family_activate_approved(_family_member_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; ctx uuid; result boolean;
BEGIN
 SELECT f.club_member_id,g.club_id,f.approval_status,f.accepted_at INTO r FROM public.club_family_members f JOIN public.club_family_groups g ON g.id=f.family_group_id WHERE f.id=_family_member_id FOR UPDATE OF f;
 IF public.is_club_chairman(auth.uid(),r.club_id) THEN
  IF r.approval_status<>'approved' OR r.accepted_at IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(),r.club_id,'members') THEN RAISE EXCEPTION 'Family addition needs acceptance and admin approval'; END IF;
  INSERT INTO public.chairman_action_context(club_id,member_id,action) VALUES(r.club_id,r.club_member_id,'family') RETURNING id INTO ctx;
 END IF;
 result:=public._chairman_family_activate_approved(_family_member_id);
 DELETE FROM public.chairman_action_context WHERE id=ctx;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.family_activate_approved(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_chairman_registration_finance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j jsonb:=to_jsonb(NEW); o jsonb:=to_jsonb(OLD); cid uuid;
BEGIN
 SELECT club_id INTO cid FROM public.tournaments WHERE id=NEW.champ_id;
 IF public.chairman_financial_write_allowed(cid) THEN RETURN NEW; END IF;
 IF NEW.champ_id=OLD.champ_id AND NEW.club_member_id=OLD.club_member_id AND EXISTS(SELECT 1 FROM public.chairman_action_context WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current() AND club_id=cid AND registration_id=NEW.id AND action='self_entry')
 AND NOT EXISTS(SELECT 1 FROM jsonb_each(j) e WHERE e.key=ANY(ARRAY['fee_paid_cents','paid_at','payment_ref']) AND e.value IS DISTINCT FROM o->e.key)
 AND (NEW.fee_settled_via IS NOT DISTINCT FROM OLD.fee_settled_via OR (OLD.fee_settled_via IS NULL AND NEW.fee_settled_via='account'))
 AND (NEW.fee_status IS NOT DISTINCT FROM OLD.fee_status OR coalesce(NEW.fee_status,'') NOT IN ('paid','waived'))
 AND (NEW.status IS NOT DISTINCT FROM OLD.status OR coalesce(NEW.status,'') NOT IN ('paid','waived') OR (NEW.status='paid' AND coalesce(public.champ_reg_own_due_cents(NEW.id),0)=0)) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(j) e WHERE e.key=ANY(ARRAY['fee_paid_cents','fee_status','paid_at','payment_ref','fee_settled_via','fee_payment_id']) AND e.value IS DISTINCT FROM o->e.key) OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('paid','waived','pending_payment')) THEN RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;