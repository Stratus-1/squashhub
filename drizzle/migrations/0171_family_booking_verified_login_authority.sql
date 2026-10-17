CREATE OR REPLACE FUNCTION public.can_book_linked_member(_club_id uuid, _club_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.club_members target
  WHERE target.id = _club_member_id AND target.club_id = _club_id
  AND (target.user_id = auth.uid() OR EXISTS (
   SELECT 1 FROM auth.users actor
   WHERE actor.id = auth.uid() AND actor.email_confirmed_at IS NOT NULL
   AND NULLIF(lower(trim(actor.email)), '') = NULLIF(lower(trim(target.email)), '')
   AND EXISTS (SELECT 1 FROM public.club_members own WHERE own.club_id = _club_id AND own.user_id = actor.id)
  ))
 );
$$;
REVOKE ALL ON FUNCTION public.can_book_linked_member(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_book_linked_member(uuid,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.can_book_linked_member(uuid,uuid) IS 'Booking authority only: own member or verified shared-email member with an own membership in the same club. Fee delegations and family billing groups do not grant booking authority.';

CREATE OR REPLACE FUNCTION public.member_booking_eligibility(_club_id uuid,_club_member_id uuid,_extra numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_buffer numeric; g record; v_credit numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF _club_member_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.club_members WHERE id=_club_member_id AND club_id=_club_id) THEN RAISE EXCEPTION 'Member does not belong to this club' USING ERRCODE='42501'; END IF;
 IF NOT (public.can_book_linked_member(_club_id,_club_member_id) OR public.is_club_admin_or_permitted(auth.uid(),_club_id,'courts') OR public.has_role(auth.uid(),'admin'::public.app_role)) THEN RAISE EXCEPTION 'Not allowed to book for this member' USING ERRCODE='42501'; END IF;
 IF _extra IS NULL OR _extra<0 OR _extra::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid pending charge'; END IF;
 SELECT min_booking_balance INTO v_buffer FROM public.clubs WHERE id=_club_id;
 SELECT * INTO g FROM public.member_account_gate(_club_member_id,_extra);
 v_credit:=public.member_credit_allowed(_club_member_id);
 RETURN jsonb_build_object('allowed',v_buffer IS NULL OR round(g.projected_owing-g.allowance+v_buffer,2)<=0,'shortfall',CASE WHEN v_buffer IS NULL THEN 0 ELSE GREATEST(round(g.projected_owing-g.allowance+v_buffer,2),0) END,'currentOwing',g.current_owing,'planAllowedDebt',g.allowance-v_credit,'approvedCredit',v_credit,'requiredBuffer',COALESCE(v_buffer,0),'effectiveAvailableBalance',g.allowance-g.projected_owing);
END $$;
REVOKE ALL ON FUNCTION public.member_booking_eligibility(uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_booking_eligibility(uuid,uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_booking_credit_allowance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_club uuid; v_buffer numeric; v_member uuid; g record; v_actor uuid:=auth.uid(); v_courts_admin boolean;
BEGIN
 IF NEW.status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
 SELECT club_id INTO v_club FROM public.courts WHERE id=NEW.court_id;
 IF NEW.club_id IS DISTINCT FROM v_club THEN RAISE EXCEPTION 'Booking club mismatch' USING ERRCODE='42501'; END IF;
 v_member:=NEW.club_member_id;
 IF v_member IS NULL AND NEW.user_id IS NOT NULL THEN SELECT id INTO v_member FROM public.club_members WHERE user_id=NEW.user_id AND club_id=v_club ORDER BY joined_at DESC LIMIT 1; END IF;
 IF v_member IS NOT NULL THEN
  PERFORM 1 FROM public.club_members WHERE id=v_member AND club_id=v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking member club mismatch' USING ERRCODE='42501'; END IF;
 END IF;
 IF v_actor IS NULL THEN RETURN NEW; END IF;
 IF public.has_role(v_actor,'admin'::public.app_role) THEN RETURN NEW; END IF;
 v_courts_admin:=public.is_club_admin_or_permitted(v_actor,v_club,'courts');
 IF NOT v_courts_admin AND (NEW.user_id IS DISTINCT FROM v_actor OR (v_member IS NOT NULL AND NOT public.can_book_linked_member(v_club,v_member))) THEN RAISE EXCEPTION 'Booking member ownership mismatch' USING ERRCODE='42501'; END IF;
 IF v_member IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN IF NEW.club_member_id IS NOT DISTINCT FROM OLD.club_member_id AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id AND NEW.court_id IS NOT DISTINCT FROM OLD.court_id AND NEW.date IS NOT DISTINCT FROM OLD.date AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time AND OLD.status='active' THEN RETURN NEW; END IF; END IF;
 SELECT min_booking_balance INTO v_buffer FROM public.clubs WHERE id=v_club;
 IF v_buffer IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.member_account_gate(v_member,0);
 IF round(g.current_owing-g.allowance+v_buffer,2)>0 THEN RAISE EXCEPTION 'Top up R% before booking a court',round(g.current_owing-g.allowance+v_buffer,2) USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_booking_credit_allowance() FROM PUBLIC,anon,authenticated;
