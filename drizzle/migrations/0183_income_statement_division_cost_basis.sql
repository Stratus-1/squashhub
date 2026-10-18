ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'bar_cost_of_sales';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'shop_cost_of_sales';

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
    SELECT 'bar_tab_entries'::text AS source_table, t.id, t.bar_item_id
    FROM public.bar_tab_entries t WHERE t.club_id = _club AND t.created_at >= _from AND t.created_at < _to
    UNION ALL
    SELECT 'bar_visitor_sales'::text, s.id, s.bar_item_id
    FROM public.bar_visitor_sales s WHERE s.club_id = _club AND s.created_at >= _from AND s.created_at < _to
      AND s.payment_status IN ('on_tab','awaiting_cash','awaiting_terminal','paid','recorded','settled')
  ), costs AS (
    SELECT COALESCE(i.division, 'bar') AS item_division, m.value, COALESCE(m.missing, true) AS missing
    FROM sales s JOIN public.bar_items i ON i.id = s.bar_item_id AND i.club_id = _club
    LEFT JOIN LATERAL (
      SELECT -sum(sm.cost_value) AS value, bool_or(sm.cost_value IS NULL) AS missing
      FROM public.bar_stock_movements sm
      WHERE sm.club_id = _club AND sm.source_table = s.source_table AND sm.source_id = s.id
        AND sm.reason IN ('sale','special_sale')
    ) m ON true
  )
  SELECT c.item_division, sum(COALESCE(c.value, 0)), count(*) FILTER (WHERE c.missing)
  FROM costs c GROUP BY c.item_division;
END $$;
REVOKE ALL ON FUNCTION public.income_statement_sale_costs(uuid,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.income_statement_sale_costs(uuid,timestamptz,timestamptz) TO authenticated, service_role;
COMMENT ON FUNCTION public.income_statement_sale_costs(uuid,timestamptz,timestamptz) IS 'Read-only finance report: historical average-cost snapshots grouped by sale date and club-owned item division; unknown costs reported explicitly, no ledger reposting.';