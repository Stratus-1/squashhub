CREATE OR REPLACE FUNCTION public._bar_recognise_account_tips(_club uuid, _member uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE t bar_tips;ref uuid; BEGIN
-- Member-account tips vest in the staff member immediately; collecting the member's debt is the club's concern.
FOR t IN SELECT * FROM bar_tips WHERE club_id=_club AND club_member_id=_member AND status='account_due' ORDER BY id FOR UPDATE LOOP
 PERFORM 1 FROM bar_counter_devices WHERE id=t.staff_id FOR UPDATE; ref:=gen_random_uuid();
 INSERT INTO club_journal_entries(club_id,journal_ref,account,debit,credit,description) VALUES(_club,ref,'creditors',t.amount,0,'Tip received — '||t.staff_name),(_club,ref,'bar_income',0,t.amount,'Tip income — '||t.staff_name);
 UPDATE bar_tips SET status='earned',earned_at=coalesce(t.created_at,now()) WHERE id=t.id;
END LOOP; END $function$;

DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT DISTINCT club_id, club_member_id FROM public.bar_tips WHERE status='account_due' AND club_member_id IS NOT NULL LOOP
  PERFORM public._bar_recognise_account_tips(r.club_id, r.club_member_id);
 END LOOP;
END $$;