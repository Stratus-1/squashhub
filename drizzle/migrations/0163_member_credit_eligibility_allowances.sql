CREATE TABLE public.club_member_credit_defaults (
 club_id uuid PRIMARY KEY REFERENCES public.clubs(id), amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.club_member_credit_defaults TO authenticated;
GRANT ALL ON public.club_member_credit_defaults TO service_role;
ALTER TABLE public.club_member_credit_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_default_read ON public.club_member_credit_defaults FOR SELECT TO authenticated USING (public.is_club_member(auth.uid(), club_id) OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'));
CREATE TABLE public.member_credit_allowance_overrides (
 club_member_id uuid PRIMARY KEY REFERENCES public.club_members(id), club_id uuid NOT NULL REFERENCES public.clubs(id), amount numeric(12,2) NOT NULL CHECK (amount >= 0), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.member_credit_allowance_overrides TO authenticated;
GRANT ALL ON public.member_credit_allowance_overrides TO service_role;
ALTER TABLE public.member_credit_allowance_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_override_read ON public.member_credit_allowance_overrides FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.club_members m WHERE m.id=club_member_id AND m.club_id=member_credit_allowance_overrides.club_id AND m.user_id=auth.uid()) OR public.is_club_admin_or_permitted(auth.uid(),club_id,'finance'));
CREATE OR REPLACE FUNCTION public.member_credit_allowed(_club_member_id uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(o.amount,d.amount,0) FROM club_members m LEFT JOIN club_member_credit_defaults d ON d.club_id=m.club_id LEFT JOIN member_credit_allowance_overrides o ON o.club_member_id=m.id AND o.club_id=m.club_id WHERE m.id=_club_member_id;
$$;
REVOKE ALL ON FUNCTION public.member_credit_allowed(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.member_credit_allowed(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.member_credit_settings(_club_id uuid,_club_member_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_default numeric:=0; v_override numeric; v_finance boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 v_finance:=public.is_club_admin_or_permitted(auth.uid(),_club_id,'finance');
 IF _club_member_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM club_members m WHERE m.id=_club_member_id AND m.club_id=_club_id AND (m.user_id=auth.uid() OR v_finance OR EXISTS(SELECT 1 FROM member_account_delegations a JOIN club_members dm ON dm.id=a.delegate_member_id AND dm.club_id=_club_id WHERE a.grantor_member_id=m.id AND a.club_id=_club_id AND a.status='active' AND dm.user_id=auth.uid()))) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
 ELSIF NOT v_finance THEN RAISE EXCEPTION 'Finance permission required' USING ERRCODE='42501'; END IF;
 SELECT amount INTO v_default FROM club_member_credit_defaults WHERE club_id=_club_id;
 SELECT amount INTO v_override FROM member_credit_allowance_overrides WHERE club_id=_club_id AND club_member_id=_club_member_id;
 RETURN jsonb_build_object('default_amount',COALESCE(v_default,0),'override_amount',v_override,'credit_allowed',COALESCE(v_override,v_default,0),'can_edit',v_finance);
END $$;
REVOKE ALL ON FUNCTION public.member_credit_settings(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_credit_settings(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.set_member_credit_allowed(_club_id uuid,_amount numeric,_club_member_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old numeric; v_old_effective numeric; v_new_effective numeric; v_default numeric; v_scope text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(),_club_id,'finance') THEN RAISE EXCEPTION 'Finance permission required' USING ERRCODE='42501'; END IF;
 IF (_club_member_id IS NULL AND _amount IS NULL) OR (_amount IS NOT NULL AND (_amount < 0 OR _amount > 9999999999.99 OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount<>round(_amount,2))) THEN RAISE EXCEPTION 'Enter a non-negative ZAR amount with at most two decimal places'; END IF;
 PERFORM 1 FROM clubs WHERE id=_club_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Club not found'; END IF;
 SELECT COALESCE(amount,0) INTO v_default FROM club_member_credit_defaults WHERE club_id=_club_id;
 v_default:=COALESCE(v_default,0);
 IF _club_member_id IS NULL THEN
  v_scope:='club'; v_old:=v_default; v_old_effective:=v_default; v_new_effective:=_amount;
  IF v_old=_amount THEN RETURN public.member_credit_settings(_club_id,NULL); END IF;
  INSERT INTO club_member_credit_defaults(club_id,amount) VALUES(_club_id,_amount) ON CONFLICT(club_id) DO UPDATE SET amount=EXCLUDED.amount,updated_at=now();
 ELSE
  PERFORM 1 FROM club_members WHERE id=_club_member_id AND club_id=_club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member does not belong to this club' USING ERRCODE='42501'; END IF;
  v_scope:='member';
  SELECT amount INTO v_old FROM member_credit_allowance_overrides WHERE club_member_id=_club_member_id AND club_id=_club_id;
  v_old_effective:=COALESCE(v_old,v_default); v_new_effective:=COALESCE(_amount,v_default);
  IF v_old IS NOT DISTINCT FROM _amount THEN RETURN public.member_credit_settings(_club_id,_club_member_id); END IF;
  IF _amount IS NULL THEN DELETE FROM member_credit_allowance_overrides WHERE club_member_id=_club_member_id AND club_id=_club_id;
  ELSE INSERT INTO member_credit_allowance_overrides(club_member_id,club_id,amount) VALUES(_club_member_id,_club_id,_amount) ON CONFLICT(club_member_id) DO UPDATE SET amount=EXCLUDED.amount,updated_at=now(); END IF;
 END IF;
 INSERT INTO audit_events(club_id,actor_user_id,entity_type,entity_id,action,before_data,after_data) VALUES(_club_id,auth.uid(),'member_credit_allowance',COALESCE(_club_member_id,_club_id),'credit_allowed_changed',jsonb_build_object('scope',v_scope,'amount',v_old,'effective_amount',v_old_effective),jsonb_build_object('scope',v_scope,'amount',_amount,'effective_amount',v_new_effective));
 RETURN public.member_credit_settings(_club_id,_club_member_id);
END $$;
REVOKE ALL ON FUNCTION public.set_member_credit_allowed(uuid,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_member_credit_allowed(uuid,numeric,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.member_account_gate(_club_member_id uuid,_extra numeric DEFAULT 0)
RETURNS TABLE(current_owing numeric,allowance numeric,projected_owing numeric,shortfall numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_club uuid; v_owing numeric; v_allow numeric:=0; v_mandate boolean;
BEGIN
 SELECT club_id INTO v_club FROM club_members WHERE id=_club_member_id;
 IF v_club IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
 SELECT COALESCE(SUM(COALESCE(debit,0)-COALESCE(credit,0)),0) INTO v_owing FROM club_journal_entries WHERE club_member_id=_club_member_id AND club_id=v_club AND account IN ('debtors','member_credits');
 SELECT EXISTS(SELECT 1 FROM stitch_mandates WHERE club_member_id=_club_member_id AND club_id=v_club AND status='active' AND frequency='monthly' AND suspended_at IS NULL) INTO v_mandate;
 IF v_mandate THEN SELECT COALESCE(SUM(amount),0) INTO v_allow FROM club_member_fee_payments WHERE club_id=v_club AND paid=false AND (club_member_id=_club_member_id OR paid_by_member_id=_club_member_id); END IF;
 v_allow:=v_allow+public.member_credit_allowed(_club_member_id);
 current_owing:=round(v_owing,2); allowance:=round(v_allow,2); projected_owing:=round(v_owing+COALESCE(_extra,0),2); shortfall:=GREATEST(round(v_owing+COALESCE(_extra,0)-v_allow,2),0);
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.member_account_gate(uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.member_account_gate(uuid,numeric) TO service_role;
CREATE OR REPLACE FUNCTION public.member_booking_eligibility(_club_id uuid,_club_member_id uuid,_extra numeric DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_settings jsonb; v_buffer numeric; g record; v_credit numeric;
BEGIN
 v_settings:=public.member_credit_settings(_club_id,_club_member_id);
 IF _extra IS NULL OR _extra<0 OR _extra::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid pending charge'; END IF;
 SELECT min_booking_balance INTO v_buffer FROM clubs WHERE id=_club_id;
 SELECT * INTO g FROM public.member_account_gate(_club_member_id,_extra);
 v_credit:=(v_settings->>'credit_allowed')::numeric;
 RETURN jsonb_build_object('allowed',v_buffer IS NULL OR round(g.projected_owing-g.allowance+v_buffer,2)<=0,'shortfall',CASE WHEN v_buffer IS NULL THEN 0 ELSE GREATEST(round(g.projected_owing-g.allowance+v_buffer,2),0) END,'currentOwing',g.current_owing,'planAllowedDebt',g.allowance-v_credit,'approvedCredit',v_credit,'requiredBuffer',COALESCE(v_buffer,0),'effectiveAvailableBalance',g.allowance-g.projected_owing);
END $$;
REVOKE ALL ON FUNCTION public.member_booking_eligibility(uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_booking_eligibility(uuid,uuid,numeric) TO authenticated;
CREATE OR REPLACE FUNCTION public.enforce_booking_credit_allowance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_club uuid; v_buffer numeric; v_member uuid; g record;
BEGIN
 IF NEW.status IS DISTINCT FROM 'active' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN IF NEW.club_member_id IS NOT DISTINCT FROM OLD.club_member_id AND NEW.court_id IS NOT DISTINCT FROM OLD.court_id AND NEW.date IS NOT DISTINCT FROM OLD.date AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time AND OLD.status='active' THEN RETURN NEW; END IF; END IF;
 SELECT club_id INTO v_club FROM courts WHERE id=NEW.court_id;
 IF NEW.club_id IS DISTINCT FROM v_club THEN RAISE EXCEPTION 'Booking club mismatch' USING ERRCODE='42501'; END IF;
 v_member:=NEW.club_member_id;
 IF v_member IS NULL AND NEW.user_id IS NOT NULL THEN SELECT id INTO v_member FROM club_members WHERE user_id=NEW.user_id AND club_id=v_club ORDER BY joined_at DESC LIMIT 1; END IF;
 IF v_member IS NULL THEN RETURN NEW; END IF;
 PERFORM 1 FROM club_members WHERE id=v_member AND club_id=v_club FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Booking member club mismatch' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 IF public.has_role(auth.uid(),'admin'::public.app_role) THEN RETURN NEW; END IF;
 SELECT min_booking_balance INTO v_buffer FROM clubs WHERE id=v_club;
 IF v_buffer IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.member_account_gate(v_member,0);
 IF round(g.current_owing-g.allowance+v_buffer,2)>0 THEN RAISE EXCEPTION 'Top up R% before booking a court',round(g.current_owing-g.allowance+v_buffer,2) USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_enforce_booking_credit_allowance BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_credit_allowance();
COMMENT ON TABLE public.club_member_credit_defaults IS 'Eligibility allowance only; absent row means R0. Never a ledger credit or payment.';
COMMENT ON TABLE public.member_credit_allowance_overrides IS 'Explicit member eligibility allowance; absent row inherits current club default. Writes only through audited finance RPC.';