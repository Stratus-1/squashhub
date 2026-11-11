-- Pro-rata joining fees count calendar months (owner, 11 Nov 2026): the join
-- month counts in full and the renewal month starts the new fee year; one
-- month or less before renewal charges the full fee for the upcoming year.
-- Mirrors src/lib/fee-proration.ts computeJoinFee. Signature/security unchanged.
CREATE OR REPLACE FUNCTION public.chairman_ensure_joining_fee(_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
 -- Calendar months from the join month (inclusive) up to the renewal month (exclusive).
 months:=(extract(year FROM renew)*12+extract(month FROM renew))-(extract(year FROM joined)*12+extract(month FROM joined));
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
END $function$;
