CREATE OR REPLACE FUNCTION public.bar_cash_up_report(_club_id uuid, _from date, _to date)
RETURNS SETOF public.bar_cash_ups LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM _bar_tip_authorise(_club_id, NULL);
  RETURN QUERY SELECT * FROM bar_cash_ups WHERE club_id=_club_id
    AND (period_end AT TIME ZONE 'Africa/Johannesburg')::date BETWEEN _from AND _to
    ORDER BY period_end DESC;
END $$;
REVOKE ALL ON FUNCTION public.bar_cash_up_report(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_cash_up_report(uuid,date,date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bar_cash_up_admin_update(_id uuid, _counted_cash numeric, _card_counted numeric, _note text, _reason text)
RETURNS public.bar_cash_ups LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c bar_cash_ups; n bar_cash_ups; v numeric;
BEGIN
  SELECT * INTO c FROM bar_cash_ups WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash-up not found'; END IF;
  PERFORM _bar_tip_authorise(c.club_id, NULL);
  IF nullif(btrim(coalesce(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF _counted_cash IS NULL OR _counted_cash < 0 OR _card_counted IS NULL OR _card_counted < 0 THEN RAISE EXCEPTION 'Amounts must be zero or more'; END IF;
  IF c.written_off AND (_counted_cash <> c.counted_cash OR _card_counted IS DISTINCT FROM c.card_counted) THEN
    RAISE EXCEPTION 'This difference was already written off — record a correcting transaction instead of changing the amounts';
  END IF;
  v := round((_counted_cash - c.expected_cash) + (_card_counted - coalesce(c.card_expected, _card_counted)), 2);
  UPDATE bar_cash_ups SET counted_cash=_counted_cash, card_counted=_card_counted, variance=v, note=left(_note,500)
    WHERE id=_id RETURNING * INTO n;
  INSERT INTO audit_events(club_id,actor_user_id,entity_type,entity_id,action,reason,before_data,after_data)
    VALUES(c.club_id,auth.uid(),'bar_cash_up',_id::text,'admin_edit',left(_reason,500),to_jsonb(c),to_jsonb(n));
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bar_cash_up_admin_update(uuid,numeric,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_cash_up_admin_update(uuid,numeric,numeric,text,text) TO authenticated, service_role;