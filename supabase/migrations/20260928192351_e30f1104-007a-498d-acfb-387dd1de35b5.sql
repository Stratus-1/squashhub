CREATE OR REPLACE FUNCTION public.bar_made_to_order_sold(_club_id uuid)
RETURNS TABLE(bar_item_id uuid, sold_qty bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_club_admin(auth.uid(), _club_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'You do not have bar administration permission for this club';
  END IF;
  RETURN QUERY
    SELECT i.id, COALESCE(m.qty, 0) + COALESCE(v.qty, 0)
    FROM public.bar_items i
    LEFT JOIN LATERAL (
      SELECT sum(e.quantity)::bigint AS qty
      FROM public.bar_tab_entries e
      WHERE e.club_id = _club_id AND e.bar_item_id = i.id
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT sum(s.quantity)::bigint AS qty
      FROM public.bar_visitor_sales s
      WHERE s.club_id = _club_id AND s.bar_item_id = i.id
        AND s.payment_status IN ('recorded', 'paid', 'settled', 'on_tab', 'awaiting_cash', 'awaiting_terminal')
    ) v ON true
    WHERE i.club_id = _club_id AND i.item_kind = 'made_to_order';
END;
$function$;