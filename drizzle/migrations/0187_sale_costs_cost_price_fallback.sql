CREATE OR REPLACE FUNCTION public.income_statement_sale_costs(_club uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(division text, cogs numeric, uncosted_lines bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), _club, 'finance') THEN
    RAISE EXCEPTION 'You do not have finance permission for this club';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to <= _from THEN RAISE EXCEPTION 'Invalid reporting period'; END IF;
  RETURN QUERY
  WITH sales AS (
    SELECT 'bar_tab_entries'::text AS source_table, t.id, t.bar_item_id, COALESCE(t.quantity,1)::numeric AS qty
    FROM public.bar_tab_entries t WHERE t.club_id = _club AND t.created_at >= _from AND t.created_at < _to
    UNION ALL
    SELECT 'bar_visitor_sales'::text, s.id, s.bar_item_id, COALESCE(s.quantity,1)::numeric
    FROM public.bar_visitor_sales s WHERE s.club_id = _club AND s.created_at >= _from AND s.created_at < _to
      AND s.payment_status IN ('on_tab','awaiting_cash','awaiting_terminal','paid','recorded','settled')
  ), costs AS (
    SELECT COALESCE(i.division, 'bar') AS item_division,
      CASE WHEN m.n IS NULL OR m.n = 0 THEN
             CASE WHEN COALESCE(i.cost_price,0) > 0 THEN s.qty * i.cost_price / GREATEST(COALESCE(i.unit_yield,1),1) END
           ELSE m.value END AS value,
      CASE WHEN m.n IS NULL OR m.n = 0 THEN COALESCE(i.cost_price,0) <= 0 ELSE m.missing END AS missing
    FROM sales s JOIN public.bar_items i ON i.id = s.bar_item_id AND i.club_id = _club
    LEFT JOIN LATERAL (
      SELECT count(*) AS n,
        sum(CASE WHEN sm.cost_value IS NOT NULL THEN -sm.cost_value
                 WHEN COALESCE(r.cost_price,0) > 0 THEN -sm.units_delta * r.cost_price / GREATEST(COALESCE(r.unit_yield,1),1)
                 ELSE 0 END) AS value,
        bool_or(sm.cost_value IS NULL AND COALESCE(r.cost_price,0) <= 0) AS missing
      FROM public.bar_stock_movements sm
      LEFT JOIN public.bar_items r ON r.id = sm.bar_item_id AND r.club_id = _club
      WHERE sm.club_id = _club AND sm.source_table = s.source_table AND sm.source_id = s.id
        AND sm.reason IN ('sale','special_sale')
    ) m ON true
  )
  SELECT c.item_division, sum(COALESCE(c.value, 0)), count(*) FILTER (WHERE c.missing)
  FROM costs c GROUP BY c.item_division;
END $$;
REVOKE ALL ON FUNCTION public.income_statement_sale_costs(uuid,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.income_statement_sale_costs(uuid,timestamptz,timestamptz) TO authenticated, service_role;
COMMENT ON FUNCTION public.income_statement_sale_costs(uuid,timestamptz,timestamptz) IS 'Read-only finance report: average-cost snapshots, falling back to current item cost price (per unit via yield); lines with neither reported as uncosted. No ledger reposting.';