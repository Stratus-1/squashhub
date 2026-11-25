CREATE OR REPLACE FUNCTION public.bar_counter_recent_app_orders(_tab_id uuid, _token uuid, _club_id uuid DEFAULT NULL, _minutes int DEFAULT 10)
RETURNS TABLE(bar_item_id uuid, item_name text, quantity int, ordered_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_club uuid;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  RETURN QUERY
  SELECT l.bar_item_id, l.item_name, l.quantity, o.created_at
    FROM public.bar_orders o JOIN public.bar_order_lines l ON l.order_id = o.id
   WHERE o.guest_tab_id = _tab_id AND o.club_id = v_club
     AND o.created_at > now() - make_interval(mins => least(greatest(coalesce(_minutes,10),1),30))
     AND o.status <> 'cancelled';
END $$;
REVOKE ALL ON FUNCTION public.bar_counter_recent_app_orders(uuid,uuid,uuid,int) FROM public;
GRANT EXECUTE ON FUNCTION public.bar_counter_recent_app_orders(uuid,uuid,uuid,int) TO anon, authenticated;