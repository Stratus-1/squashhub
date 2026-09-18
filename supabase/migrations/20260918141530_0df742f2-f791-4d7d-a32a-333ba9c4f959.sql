CREATE OR REPLACE FUNCTION public.bar_open_tabs(_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(t ORDER BY t->>'opened_at')
    FROM (
      SELECT jsonb_build_object(
        'tab_id', g.id,
        'guest_name', g.guest_name,
        'status', g.status,
        'opened_at', g.opened_at,
        'operator', d.label,
        'total', COALESCE((SELECT sum(s.total) FROM public.bar_visitor_sales s WHERE s.guest_tab_id = g.id), 0),
        'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', b.name, 'quantity', s.quantity, 'total', s.total)
                                            ORDER BY s.created_at)
                            FROM public.bar_visitor_sales s
                            LEFT JOIN public.bar_items b ON b.id = s.bar_item_id
                           WHERE s.guest_tab_id = g.id), '[]'::jsonb)
      ) AS t
      FROM public.bar_guest_tabs g
      LEFT JOIN public.bar_counter_devices d ON d.id = g.counter_device_id
      WHERE g.club_id = _club_id AND g.status IN ('open','closing')
    ) q
  ), '[]'::jsonb);
END;
$function$;