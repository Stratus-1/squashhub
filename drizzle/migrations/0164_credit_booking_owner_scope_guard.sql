CREATE OR REPLACE FUNCTION public.enforce_booking_credit_allowance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_club uuid; v_buffer numeric; v_member uuid; g record; v_actor uuid:=auth.uid(); v_finance boolean;
BEGIN
 IF NEW.status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
 SELECT club_id INTO v_club FROM courts WHERE id=NEW.court_id;
 IF NEW.club_id IS DISTINCT FROM v_club THEN RAISE EXCEPTION 'Booking club mismatch' USING ERRCODE='42501'; END IF;
 v_member:=NEW.club_member_id;
 IF v_member IS NULL AND NEW.user_id IS NOT NULL THEN SELECT id INTO v_member FROM club_members WHERE user_id=NEW.user_id AND club_id=v_club ORDER BY joined_at DESC LIMIT 1; END IF;
 IF v_member IS NULL THEN RETURN NEW; END IF;
 PERFORM 1 FROM club_members WHERE id=v_member AND club_id=v_club FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Booking member club mismatch' USING ERRCODE='42501'; END IF;
 IF v_actor IS NULL THEN RETURN NEW; END IF;
 IF public.has_role(v_actor,'admin'::public.app_role) THEN RETURN NEW; END IF;
 v_finance:=public.is_club_admin_or_permitted(v_actor,v_club,'courts');
 IF NOT v_finance AND NOT EXISTS(SELECT 1 FROM club_members WHERE id=v_member AND club_id=v_club AND user_id=NEW.user_id) THEN RAISE EXCEPTION 'Booking member ownership mismatch' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN IF NEW.club_member_id IS NOT DISTINCT FROM OLD.club_member_id AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id AND NEW.court_id IS NOT DISTINCT FROM OLD.court_id AND NEW.date IS NOT DISTINCT FROM OLD.date AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time AND OLD.status='active' THEN RETURN NEW; END IF; END IF;
 SELECT min_booking_balance INTO v_buffer FROM clubs WHERE id=v_club;
 IF v_buffer IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.member_account_gate(v_member,0);
 IF round(g.current_owing-g.allowance+v_buffer,2)>0 THEN RAISE EXCEPTION 'Top up R% before booking a court',round(g.current_owing-g.allowance+v_buffer,2) USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;