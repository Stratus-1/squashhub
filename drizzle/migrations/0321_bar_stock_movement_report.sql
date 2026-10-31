CREATE OR REPLACE FUNCTION public.bar_stock_movement_report(_club_id uuid, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_start timestamptz; v_end timestamptz; v_now timestamptz := statement_timestamp(); v_history timestamptz := '2026-09-27T15:20:00Z'; v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar') THEN RAISE EXCEPTION 'You do not have bar permission for this club'; END IF;
 IF _from IS NULL OR _to IS NULL OR _from > _to OR _to > (v_now AT TIME ZONE 'Africa/Johannesburg')::date THEN RAISE EXCEPTION 'Choose valid dates up to today'; END IF;
 v_start := _from::timestamp AT TIME ZONE 'Africa/Johannesburg';
 v_end := LEAST((_to + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg', v_now);
 WITH movement AS (
 SELECT m.bar_item_id,
 COALESCE(sum(m.units_delta) FILTER (WHERE m.created_at >= v_start),0) AS since_start,
 COALESCE(sum(m.units_delta) FILTER (WHERE m.created_at >= v_end),0) AS after_end,
 COALESCE(sum(m.units_delta) FILTER (WHERE m.created_at >= v_start AND m.created_at < v_end AND m.reason = 'purchase'),0) AS receipts,
 COALESCE(sum(m.units_delta) FILTER (WHERE m.created_at >= v_start AND m.created_at < v_end AND m.reason = 'sale'),0) AS sales,
 COALESCE(sum(m.units_delta) FILTER (WHERE m.created_at >= v_start AND m.created_at < v_end AND m.reason = 'special_sale'),0) AS specials,
 COALESCE(sum(m.units_delta) FILTER (WHERE m.created_at >= v_start AND m.created_at < v_end AND m.reason = 'club_use'),0) AS club_use,
 COALESCE(sum(m.units_delta) FILTER (WHERE m.created_at >= v_start AND m.created_at < v_end AND m.reason NOT IN ('purchase','sale','special_sale','club_use')),0) AS adjustments,
 COALESCE(sum(m.units_delta) FILTER (WHERE m.created_at >= v_start AND m.created_at < v_end),0) AS net
 FROM public.bar_stock_movements m WHERE m.club_id = _club_id AND m.created_at >= v_start AND m.created_at <= v_now GROUP BY m.bar_item_id
 ) SELECT COALESCE(jsonb_agg(jsonb_build_object(
 'id',i.id,'name',i.name,'division',COALESCE(i.division,'bar'),'unit_label',COALESCE(NULLIF(i.unit_label,''),'unit'),
 'opening',CASE WHEN v_start >= v_history THEN i.stock_units-COALESCE(m.since_start,0) END,
 'receipts',COALESCE(m.receipts,0),'sales',COALESCE(m.sales,0),'specials',COALESCE(m.specials,0),'club_use',COALESCE(m.club_use,0),'adjustments',COALESCE(m.adjustments,0),'net',COALESCE(m.net,0),
 'closing',CASE WHEN v_end >= v_history THEN i.stock_units-COALESCE(m.after_end,0) END,'current',i.stock_units
 ) ORDER BY i.division,i.name),'[]'::jsonb) INTO v_rows
 FROM public.bar_items i LEFT JOIN movement m ON m.bar_item_id=i.id
 WHERE i.club_id=_club_id AND i.item_kind='stock' AND (i.archived_at IS NULL OR COALESCE(m.net,0) <> 0 OR COALESCE(m.since_start,0) <> 0);
 RETURN jsonb_build_object('generated_at',v_now,'history_complete',v_start >= v_history,'rows',v_rows);
END; $$;
REVOKE ALL ON FUNCTION public.bar_stock_movement_report(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_stock_movement_report(uuid,date,date) TO authenticated, service_role;