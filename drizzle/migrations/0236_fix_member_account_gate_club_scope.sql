CREATE OR REPLACE FUNCTION public.member_account_gate(_club_member_id uuid, _extra numeric DEFAULT 0)
 RETURNS TABLE(current_owing numeric, allowance numeric, projected_owing numeric, shortfall numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_owing numeric; v_allow numeric:=0; v_mandate boolean;
BEGIN
 SELECT club_id INTO v_club FROM club_members WHERE id=_club_member_id;
 IF v_club IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
 SELECT COALESCE(SUM(COALESCE(debit,0)-COALESCE(credit,0)),0) INTO v_owing FROM club_journal_entries WHERE club_member_id=_club_member_id AND club_id=v_club AND account IN ('debtors','member_credits');
 SELECT EXISTS(SELECT 1 FROM stitch_mandates WHERE club_member_id=_club_member_id AND club_id=v_club AND status='active' AND frequency='monthly' AND suspended_at IS NULL) INTO v_mandate;
 IF v_mandate THEN
   SELECT COALESCE(SUM(f.amount),0) INTO v_allow
   FROM club_member_fee_payments f JOIN club_members cm ON cm.id=f.club_member_id
   WHERE cm.club_id=v_club AND f.paid=false AND (f.club_member_id=_club_member_id OR f.paid_by_member_id=_club_member_id);
 END IF;
 v_allow:=v_allow+public.member_credit_allowed(_club_member_id);
 current_owing:=round(v_owing,2); allowance:=round(v_allow,2); projected_owing:=round(v_owing+COALESCE(_extra,0),2); shortfall:=GREATEST(round(v_owing+COALESCE(_extra,0)-v_allow,2),0);
 RETURN NEXT;
END $function$;