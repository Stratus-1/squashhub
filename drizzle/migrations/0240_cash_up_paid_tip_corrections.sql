CREATE OR REPLACE FUNCTION public.bar_cash_up_edit_payouts(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c bar_cash_ups;
BEGIN
  SELECT * INTO c FROM bar_cash_ups WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash-up not found'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to edit a cash-up'; END IF;
  PERFORM _bar_tip_authorise(c.club_id,NULL);
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'staff_name',p.staff_name,'amount',p.amount,
    'maximum',greatest(p.amount,coalesce((SELECT sum(t.amount) FROM bar_tips t WHERE t.club_id=c.club_id AND t.staff_id=p.staff_id AND t.status='earned'),0)
      -coalesce((SELECT sum(o.amount) FROM bar_tip_payouts o WHERE o.club_id=c.club_id AND o.staff_id=p.staff_id AND o.id<>p.id),0))) ORDER BY p.staff_name,p.id)
    FROM bar_tip_payouts p WHERE p.club_id=c.club_id AND p.id=md5(c.id::text||':'||p.staff_id::text)::uuid),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.bar_cash_up_edit_payouts(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bar_cash_up_edit_payouts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.bar_cash_up_admin_correct(_id uuid,_counted_cash numeric,_card_counted numeric,_note text,_reason text,_payouts jsonb)
RETURNS bar_cash_ups LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c bar_cash_ups; n bar_cash_ups; p bar_tip_payouts; j jsonb; amount_new numeric; expected numeric;
  delta numeric; total_delta numeric:=0; maximum numeric; before_payouts jsonb; after_payouts jsonb; club uuid;
BEGIN
  SELECT club_id INTO club FROM bar_cash_ups WHERE id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash-up not found'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to edit a cash-up'; END IF;
  PERFORM _bar_tip_authorise(club,NULL);
  IF nullif(btrim(coalesce(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bar_cash_up:'||club));
  SELECT * INTO c FROM bar_cash_ups WHERE id=_id AND club_id=club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash-up no longer exists; refresh and try again'; END IF;
  IF _payouts IS NULL OR jsonb_typeof(_payouts)<>'array' THEN RAISE EXCEPTION 'Invalid tip corrections'; END IF;
  IF jsonb_array_length(_payouts)>100 THEN RAISE EXCEPTION 'Too many tip corrections'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_payouts))<>(SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(_payouts) x) THEN
    RAISE EXCEPTION 'Duplicate tip correction';
  END IF;
  IF jsonb_array_length(_payouts)>0 AND EXISTS(SELECT 1 FROM bar_cash_ups WHERE club_id=club AND period_end>c.period_end) THEN
    RAISE EXCEPTION 'Only the most recent cash-up can have paid tips corrected';
  END IF;
  before_payouts:=bar_cash_up_edit_payouts(_id);
  PERFORM d.id FROM bar_counter_devices d JOIN bar_tip_payouts bp ON bp.staff_id=d.id AND bp.club_id=club
    WHERE bp.id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(_payouts) x) AND d.club_id=club ORDER BY d.id FOR UPDATE OF d;
  FOR j IN SELECT x FROM jsonb_array_elements(_payouts) x ORDER BY x->>'id' LOOP
    amount_new:=(j->>'amount')::numeric; expected:=(j->>'expected_amount')::numeric;
    IF amount_new IS NULL OR amount_new::text IN ('NaN','Infinity','-Infinity') OR amount_new<=0 OR amount_new<>round(amount_new,2)
      OR expected IS NULL OR expected::text IN ('NaN','Infinity','-Infinity') OR expected<=0 THEN
      RAISE EXCEPTION 'Tips paid out must be positive amounts with up to two decimals';
    END IF;
    SELECT * INTO p FROM bar_tip_payouts WHERE id=(j->>'id')::uuid AND club_id=club FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tip payout not found'; END IF;
    IF p.id<>md5(c.id::text||':'||p.staff_id::text)::uuid THEN RAISE EXCEPTION 'Tip payout does not belong to this cash-up'; END IF;
    IF p.amount=amount_new THEN CONTINUE; END IF;
    IF p.amount<>expected THEN RAISE EXCEPTION 'Paid tips changed; refresh before editing'; END IF;
    SELECT coalesce((SELECT sum(t.amount) FROM bar_tips t WHERE t.club_id=club AND t.staff_id=p.staff_id AND t.status='earned'),0)
      -coalesce((SELECT sum(o.amount) FROM bar_tip_payouts o WHERE o.club_id=club AND o.staff_id=p.staff_id AND o.id<>p.id),0) INTO maximum;
    IF amount_new>maximum AND amount_new>p.amount THEN RAISE EXCEPTION 'Cash payout exceeds unpaid tips'; END IF;
    delta:=amount_new-p.amount;
    INSERT INTO club_journal_entries(club_id,journal_ref,account,debit,credit,description) VALUES
      (club,p.id,'bar_cost_of_sales',greatest(delta,0),greatest(-delta,0),'Cash-up paid-tip correction: '||p.staff_name),
      (club,p.id,'cash',greatest(-delta,0),greatest(delta,0),'Cash-up paid-tip correction: '||p.staff_name);
    UPDATE bar_tip_payouts SET amount=amount_new WHERE id=p.id AND club_id=club;
    total_delta:=total_delta+delta;
  END LOOP;
  IF total_delta<>0 THEN
    UPDATE bar_cash_ups SET totals=jsonb_set(coalesce(totals,'{}'::jsonb),'{tip_payouts}',to_jsonb(coalesce((totals->>'tip_payouts')::numeric,0)+total_delta)),
      tips_paid_at_cash_up=coalesce(tips_paid_at_cash_up,0)+total_delta WHERE id=_id;
    IF c.written_off THEN
      INSERT INTO club_journal_entries(club_id,journal_ref,account,debit,credit,description) VALUES
        (club,c.id,'cash',greatest(total_delta,0),greatest(-total_delta,0),'Cash-up write-off correction (paid tips)'),
        (club,c.id,'bar_cost_of_sales',greatest(-total_delta,0),greatest(total_delta,0),'Cash-up write-off correction (paid tips)');
      UPDATE bar_cash_ups SET write_off_amount=coalesce(write_off_amount,0)+total_delta WHERE id=_id;
    END IF;
  END IF;
  n:=bar_cash_up_admin_update(_id,_counted_cash,_card_counted,_note,_reason);
  after_payouts:=bar_cash_up_edit_payouts(_id);
  IF before_payouts IS DISTINCT FROM after_payouts THEN
    INSERT INTO audit_events(club_id,actor_user_id,entity_type,entity_id,action,reason,before_data,after_data)
      VALUES(club,auth.uid(),'bar_cash_up',_id,'admin_tip_correction',left(_reason,500),
        jsonb_build_object('cash_up',to_jsonb(c),'payouts',before_payouts),jsonb_build_object('cash_up',to_jsonb(n),'payouts',after_payouts));
  END IF;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bar_cash_up_admin_correct(uuid,numeric,numeric,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bar_cash_up_admin_correct(uuid,numeric,numeric,text,text,jsonb) TO authenticated;