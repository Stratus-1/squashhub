ALTER TABLE public.bar_cash_ups
  ADD COLUMN IF NOT EXISTS tips_paid_at_cash_up numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_expected numeric(12,2),
  ADD COLUMN IF NOT EXISTS card_counted numeric(12,2),
  ADD COLUMN IF NOT EXISTS written_off boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS write_off_amount numeric(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.bar_cash_up_close_v2(
  _club_id uuid, _period_start timestamptz, _tip_payouts jsonb, _card_counted numeric,
  _counted_cash numeric, _write_off boolean, _note text, _request_id uuid, _token uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid; s timestamptz; e timestamptz; sm jsonb; prior bar_cash_ups; n text; p jsonb;
  tips_paid numeric := 0; amt numeric; exp_cash numeric; exp_card numeric; v_cash numeric; v_card numeric; total_v numeric;
BEGIN
  d := _bar_tip_authorise(_club_id,_token);
  IF NOT EXISTS(SELECT 1 FROM club_bar_settings WHERE club_id=_club_id AND cash_up_enabled) THEN RAISE EXCEPTION 'Cash-up is not enabled'; END IF;
  IF _request_id IS NULL OR _counted_cash IS NULL OR _counted_cash<0 OR _counted_cash<>round(_counted_cash,2)
     OR _card_counted IS NULL OR _card_counted<0 OR _card_counted<>round(_card_counted,2) THEN RAISE EXCEPTION 'Invalid counted amounts'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bar_cash_up:'||_club_id));
  SELECT * INTO prior FROM bar_cash_ups WHERE id=_request_id;
  IF FOUND THEN IF prior.club_id<>_club_id THEN RAISE EXCEPTION 'Cash-up retry does not match'; END IF; RETURN to_jsonb(prior); END IF;
  s := _bar_cash_up_start(_club_id);
  IF _period_start IS DISTINCT FROM s THEN RAISE EXCEPTION 'Another cash-up was completed; refresh and try again'; END IF;

  -- Tips handed over in cash as part of this cash-up (admin may pay less than owed).
  FOR p IN SELECT * FROM jsonb_array_elements(coalesce(_tip_payouts,'[]'::jsonb)) LOOP
    amt := round(coalesce((p->>'amount')::numeric,0),2);
    IF amt > 0 THEN
      PERFORM bar_pay_staff_tips(_club_id,(p->>'staff_id')::uuid,amt,
        md5(_request_id::text||':'||(p->>'staff_id'))::uuid,_token);
      tips_paid := tips_paid + amt;
    END IF;
  END LOOP;

  e := clock_timestamp();
  sm := _bar_cash_up_summary(_club_id,s,e);
  exp_cash := (sm->>'expected_cash')::numeric;
  exp_card := round(coalesce((sm#>>'{methods,card_bar,sales}')::numeric,0)+coalesce((sm#>>'{methods,card_bar,tips}')::numeric,0),2);
  v_cash := _counted_cash - exp_cash;
  v_card := _card_counted - exp_card;
  total_v := v_cash + v_card;
  IF d IS NOT NULL THEN SELECT label INTO n FROM bar_counter_devices WHERE id=d; END IF;

  INSERT INTO bar_cash_ups(id,club_id,period_start,period_end,totals,expected_cash,counted_cash,variance,note,closed_by_device,closed_by_name,actor_user_id,
    tips_paid_at_cash_up,card_expected,card_counted,written_off,write_off_amount)
  VALUES(_request_id,_club_id,s,e,sm,exp_cash,_counted_cash,total_v,nullif(btrim(left(_note,500)),''),d,n,auth.uid(),
    tips_paid,exp_card,_card_counted,coalesce(_write_off,false) AND total_v<>0, CASE WHEN coalesce(_write_off,false) THEN total_v ELSE 0 END)
  RETURNING * INTO prior;

  -- Write-off: shortfall increases bar cost of sales; surplus reduces it.
  IF coalesce(_write_off,false) THEN
    IF v_cash <> 0 THEN
      INSERT INTO club_journal_entries(club_id,journal_ref,account,debit,credit,description) VALUES
        (_club_id,_request_id,'bar_cost_of_sales',greatest(-v_cash,0),greatest(v_cash,0),'Cash-up write-off (cash '||CASE WHEN v_cash<0 THEN 'short' ELSE 'over' END||')'),
        (_club_id,_request_id,'cash',greatest(v_cash,0),greatest(-v_cash,0),'Cash-up write-off (cash '||CASE WHEN v_cash<0 THEN 'short' ELSE 'over' END||')');
    END IF;
    IF v_card <> 0 THEN
      INSERT INTO club_journal_entries(club_id,journal_ref,account,debit,credit,description) VALUES
        (_club_id,_request_id,'bar_cost_of_sales',greatest(-v_card,0),greatest(v_card,0),'Cash-up write-off (card '||CASE WHEN v_card<0 THEN 'short' ELSE 'over' END||')'),
        (_club_id,_request_id,'bank_current',greatest(v_card,0),greatest(-v_card,0),'Cash-up write-off (card '||CASE WHEN v_card<0 THEN 'short' ELSE 'over' END||')');
    END IF;
  END IF;
  RETURN to_jsonb(prior);
END $$;
REVOKE ALL ON FUNCTION public.bar_cash_up_close_v2(uuid,timestamptz,jsonb,numeric,numeric,boolean,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bar_cash_up_close_v2(uuid,timestamptz,jsonb,numeric,numeric,boolean,text,uuid,uuid) TO anon,authenticated;