CREATE FUNCTION public.bar_cash_up_edit_staff(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c bar_cash_ups;
BEGIN
 SELECT * INTO c FROM bar_cash_ups WHERE id=_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cash-up not found'; END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to edit a cash-up'; END IF;
 PERFORM _bar_tip_authorise(c.club_id,NULL);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',md5(c.id::text||':'||d.id::text)::uuid,'staff_name',coalesce(p.staff_name,d.label),'amount',coalesce(p.amount,0),
 'maximum',greatest(coalesce(p.amount,0),least(
 coalesce((SELECT sum(t.amount) FROM bar_tips t WHERE t.club_id=c.club_id AND t.staff_id=d.id AND t.status='earned' AND t.created_at<=c.period_end),0)-coalesce((SELECT sum(o.amount) FROM bar_tip_payouts o WHERE o.club_id=c.club_id AND o.staff_id=d.id AND o.id<>md5(c.id::text||':'||d.id::text)::uuid AND o.created_at<=c.period_end),0),
 coalesce((SELECT sum(t.amount) FROM bar_tips t WHERE t.club_id=c.club_id AND t.staff_id=d.id AND t.status='earned'),0)-coalesce((SELECT sum(o.amount) FROM bar_tip_payouts o WHERE o.club_id=c.club_id AND o.staff_id=d.id AND o.id<>md5(c.id::text||':'||d.id::text)::uuid),0)))) ORDER BY coalesce(p.staff_name,d.label),d.id)
 FROM bar_counter_devices d LEFT JOIN bar_tip_payouts p ON p.id=md5(c.id::text||':'||d.id::text)::uuid AND p.club_id=c.club_id
 WHERE d.club_id=c.club_id AND (p.id IS NOT NULL OR EXISTS(SELECT 1 FROM bar_tips t WHERE t.club_id=c.club_id AND t.staff_id=d.id AND t.status='earned' AND t.created_at<=c.period_end))), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.bar_cash_up_edit_staff(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bar_cash_up_edit_staff(uuid) TO authenticated;

CREATE FUNCTION public._bar_cash_up_reconcile_saved(_id uuid,_settle boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c bar_cash_ups; opening numeric; ec numeric; eb numeric; vc numeric; vb numeric; dc numeric; db numeric; prior_cash numeric; prior_bank numeric;
BEGIN
 SELECT * INTO c FROM bar_cash_ups WHERE id=_id FOR UPDATE;
 SELECT counted_cash INTO opening FROM bar_cash_ups WHERE club_id=c.club_id AND period_end<c.period_end ORDER BY period_end DESC LIMIT 1;
 opening:=coalesce(opening,(c.totals->>'cash_opening')::numeric,0);
 ec:=round(opening+coalesce((c.totals#>>'{methods,cash,sales}')::numeric,0)+coalesce((c.totals#>>'{methods,cash,tips}')::numeric,0)-coalesce((c.totals->>'tip_payouts')::numeric,0),2);
 eb:=round(coalesce((c.totals#>>'{methods,card_bar,sales}')::numeric,0)+coalesce((c.totals#>>'{methods,card_bar,tips}')::numeric,0),2);
 vc:=c.counted_cash-ec; vb:=coalesce(c.card_counted,eb)-eb;
 SELECT coalesce(sum(debit-credit) FILTER(WHERE account='cash'),0),coalesce(sum(debit-credit) FILTER(WHERE account='bank_current'),0) INTO prior_cash,prior_bank FROM club_journal_entries WHERE club_id=c.club_id AND journal_ref=c.id;
 dc:=(CASE WHEN _settle THEN vc ELSE 0 END)-prior_cash;
 db:=(CASE WHEN _settle THEN vb ELSE 0 END)-prior_bank;
 IF dc<>0 THEN
 INSERT INTO club_journal_entries(club_id,journal_ref,account,debit,credit,description) VALUES
 (c.club_id,c.id,'cash',greatest(dc,0),greatest(-dc,0),'Audited cash-up reconciliation correction'),
 (c.club_id,c.id,'bar_cost_of_sales',greatest(-dc,0),greatest(dc,0),'Audited cash-up reconciliation correction');
 END IF;
 IF db<>0 THEN
 INSERT INTO club_journal_entries(club_id,journal_ref,account,debit,credit,description) VALUES
 (c.club_id,c.id,'bank_current',greatest(db,0),greatest(-db,0),'Audited cash-up card reconciliation correction'),
 (c.club_id,c.id,'bar_cost_of_sales',greatest(-db,0),greatest(db,0),'Audited cash-up card reconciliation correction');
 END IF;
 UPDATE bar_cash_ups SET expected_cash=ec,card_expected=eb,variance=vc+vb,written_off=coalesce(_settle,false) AND (vc<>0 OR vb<>0),write_off_amount=CASE WHEN _settle THEN vc+vb ELSE 0 END,
 totals=jsonb_set(jsonb_set(coalesce(totals,'{}'::jsonb),'{cash_opening}',to_jsonb(opening)),'{expected_cash}',to_jsonb(ec)) WHERE id=c.id;
END $$;
REVOKE ALL ON FUNCTION public._bar_cash_up_reconcile_saved(uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.bar_cash_up_admin_correct_full(_id uuid,_counted_cash numeric,_card_counted numeric,_note text,_reason text,_payouts jsonb,_write_off boolean,_expected jsonb)
RETURNS bar_cash_ups LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c bar_cash_ups; n bar_cash_ups; later bar_cash_ups; club uuid; j jsonb; s bar_counter_devices; p bar_tip_payouts; staff uuid; new_amount numeric; old_amount numeric; expected_amount numeric; delta numeric; total_delta numeric:=0; max_amount numeric; before_staff jsonb; snapshot jsonb;
BEGIN
 SELECT club_id INTO club FROM bar_cash_ups WHERE id=_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cash-up not found'; END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to edit a cash-up'; END IF;
 PERFORM _bar_tip_authorise(club,NULL);
 IF nullif(btrim(coalesce(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
 IF _counted_cash IS NULL OR _card_counted IS NULL OR _counted_cash::text IN ('NaN','Infinity','-Infinity') OR _card_counted::text IN ('NaN','Infinity','-Infinity') OR _counted_cash<0 OR _card_counted<0 OR _counted_cash<>round(_counted_cash,2) OR _card_counted<>round(_card_counted,2) THEN RAISE EXCEPTION 'Invalid counted amounts'; END IF;
 IF _payouts IS NULL OR jsonb_typeof(_payouts)<>'array' OR jsonb_array_length(_payouts)>100 THEN RAISE EXCEPTION 'Invalid tip corrections'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(_payouts))<>(SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(_payouts) x) THEN RAISE EXCEPTION 'Duplicate tip correction'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('bar_cash_up:'||club));
 SELECT * INTO c FROM bar_cash_ups WHERE id=_id AND club_id=club FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cash-up no longer exists; refresh and try again'; END IF;
 snapshot:=jsonb_build_object('counted_cash',c.counted_cash,'card_counted',c.card_counted,'note',c.note,'written_off',c.written_off,'tip_payouts',coalesce((c.totals->>'tip_payouts')::numeric,0));
 IF _expected IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Cash-up changed; refresh before editing'; END IF;
 SELECT * INTO later FROM bar_cash_ups WHERE club_id=club AND period_end>c.period_end ORDER BY period_end LIMIT 1 FOR UPDATE;
 before_staff:=bar_cash_up_edit_staff(_id);
 PERFORM d.id FROM bar_counter_devices d WHERE d.club_id=club AND md5(c.id::text||':'||d.id::text)::uuid IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(_payouts) x) ORDER BY d.id FOR UPDATE;
 FOR j IN SELECT x FROM jsonb_array_elements(_payouts) x ORDER BY x->>'id' LOOP
  new_amount:=(j->>'amount')::numeric; expected_amount:=(j->>'expected_amount')::numeric;
  IF new_amount IS NULL OR expected_amount IS NULL OR new_amount::text IN ('NaN','Infinity','-Infinity') OR expected_amount::text IN ('NaN','Infinity','-Infinity') OR new_amount<0 OR expected_amount<0 OR new_amount<>round(new_amount,2) THEN RAISE EXCEPTION 'Tips paid out must be positive amounts with up to two decimals; use zero for no payout'; END IF;
  SELECT * INTO s FROM bar_counter_devices WHERE club_id=club AND md5(c.id::text||':'||id::text)::uuid=(j->>'id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tip payout does not belong to this cash-up'; END IF;
  staff:=s.id;
  SELECT * INTO p FROM bar_tip_payouts WHERE club_id=club AND id=(j->>'id')::uuid FOR UPDATE;
  old_amount:=coalesce(p.amount,0);
  IF old_amount<>expected_amount THEN RAISE EXCEPTION 'Paid tips changed; refresh before editing'; END IF;
  IF new_amount=old_amount THEN CONTINUE; END IF;
  SELECT (x->>'maximum')::numeric INTO max_amount FROM jsonb_array_elements(bar_cash_up_edit_staff(_id)) x WHERE x->>'id'=j->>'id';
  IF new_amount>coalesce(max_amount,0) THEN RAISE EXCEPTION 'Cash payout exceeds available tips for this shift'; END IF;
  delta:=new_amount-old_amount;
  INSERT INTO club_journal_entries(club_id,journal_ref,account,debit,credit,description) VALUES
   (club,(j->>'id')::uuid,'bar_cost_of_sales',greatest(delta,0),greatest(-delta,0),'Audited paid-tip correction: '||s.label),
   (club,(j->>'id')::uuid,'cash',greatest(-delta,0),greatest(delta,0),'Audited paid-tip correction: '||s.label);
  IF new_amount=0 THEN DELETE FROM bar_tip_payouts WHERE id=(j->>'id')::uuid AND club_id=club;
  ELSIF old_amount=0 THEN
   INSERT INTO bar_tip_payouts(id,club_id,staff_id,staff_name,amount,actor_user_id,created_at) VALUES((j->>'id')::uuid,club,staff,s.label,new_amount,auth.uid(),c.period_end);
  ELSE UPDATE bar_tip_payouts SET amount=new_amount WHERE id=p.id AND club_id=club; END IF;
  total_delta:=total_delta+delta;
 END LOOP;
 UPDATE bar_cash_ups SET counted_cash=_counted_cash,card_counted=_card_counted,note=left(_note,500),tips_paid_at_cash_up=coalesce(tips_paid_at_cash_up,0)+total_delta,
 totals=jsonb_set(coalesce(totals,'{}'::jsonb),'{tip_payouts}',to_jsonb(coalesce((totals->>'tip_payouts')::numeric,0)+total_delta)) WHERE id=c.id;
 PERFORM _bar_cash_up_reconcile_saved(c.id,coalesce(_write_off,false));
 IF later.id IS NOT NULL AND _counted_cash IS DISTINCT FROM c.counted_cash THEN
  PERFORM _bar_cash_up_reconcile_saved(later.id,later.written_off);
  INSERT INTO audit_events(club_id,actor_user_id,entity_type,entity_id,action,reason,before_data,after_data)
  SELECT club,auth.uid(),'bar_cash_up',later.id,'opening_cash_correction',left(_reason,500),to_jsonb(later),to_jsonb(b) FROM bar_cash_ups b WHERE b.id=later.id;
 END IF;
 SELECT * INTO n FROM bar_cash_ups WHERE id=c.id;
 INSERT INTO audit_events(club_id,actor_user_id,entity_type,entity_id,action,reason,before_data,after_data)
 VALUES(club,auth.uid(),'bar_cash_up',c.id,'admin_full_correction',left(_reason,500),jsonb_build_object('cash_up',to_jsonb(c),'payouts',before_staff),jsonb_build_object('cash_up',to_jsonb(n),'payouts',bar_cash_up_edit_staff(_id)));
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bar_cash_up_admin_correct_full(uuid,numeric,numeric,text,text,jsonb,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bar_cash_up_admin_correct_full(uuid,numeric,numeric,text,text,jsonb,boolean,jsonb) TO authenticated;