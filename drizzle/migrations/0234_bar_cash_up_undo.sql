CREATE OR REPLACE FUNCTION public.bar_cash_up_undo(_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c bar_cash_ups; refs uuid[]; pay_ids uuid[]; v_ref uuid; r record;
BEGIN
  SELECT * INTO c FROM bar_cash_ups WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash-up not found'; END IF;
  IF auth.uid() IS NULL OR NOT coalesce((is_club_admin_or_permitted(auth.uid(),c.club_id,'bar') OR has_club_permission(auth.uid(),c.club_id,'finance') OR has_role(auth.uid(),'admin')),false) THEN
    RAISE EXCEPTION 'Only a bar or finance admin can undo a cash-up';
  END IF;
  IF nullif(btrim(coalesce(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bar_cash_up:'||c.club_id));
  IF EXISTS(SELECT 1 FROM bar_cash_ups WHERE club_id=c.club_id AND period_end > c.period_end) THEN
    RAISE EXCEPTION 'Only the most recent cash-up can be undone';
  END IF;

  -- Tip payouts handed over during this cash-up return to the staff balance.
  SELECT array_agg(p.id) INTO pay_ids FROM bar_tip_payouts p
   WHERE p.club_id=c.club_id AND p.id = md5(c.id::text||':'||p.staff_id::text)::uuid;
  refs := array_append(coalesce(pay_ids,'{}'::uuid[]), c.id);

  -- Reverse any write-off / tip payout journals (kept for audit).
  FOR r IN SELECT DISTINCT journal_ref FROM club_journal_entries
            WHERE club_id=c.club_id AND journal_ref = ANY(refs) AND reverses_journal_ref IS NULL LOOP
    v_ref := gen_random_uuid();
    INSERT INTO club_journal_entries(club_id,journal_ref,account,debit,credit,description,reverses_journal_ref,custom_account_id)
      SELECT club_id,v_ref,account,credit,debit,'Undo cash-up: '||coalesce(description,''),r.journal_ref,custom_account_id
        FROM club_journal_entries WHERE club_id=c.club_id AND journal_ref=r.journal_ref;
  END LOOP;
  IF pay_ids IS NOT NULL THEN DELETE FROM bar_tip_payouts WHERE id = ANY(pay_ids); END IF;

  INSERT INTO audit_events(club_id,actor_user_id,entity_type,entity_id,action,reason,before_data,after_data)
    VALUES(c.club_id,auth.uid(),'bar_cash_up',_id,'admin_undo',left(_reason,500),to_jsonb(c),
           jsonb_build_object('tip_payouts_returned',coalesce(array_length(pay_ids,1),0)));
  DELETE FROM bar_cash_ups WHERE id=_id;
  RETURN jsonb_build_object('undone',_id,'tip_payouts_returned',coalesce(array_length(pay_ids,1),0));
END $$;

REVOKE ALL ON FUNCTION public.bar_cash_up_undo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_cash_up_undo(uuid, text) TO authenticated;