CREATE OR REPLACE FUNCTION public.bar_admin_tab_to_member_account(_club_id uuid, _tab_id uuid, _club_member_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tab public.bar_guest_tabs%ROWTYPE;
  v_member public.club_members%ROWTYPE;
  v_sale public.bar_visitor_sales%ROWTYPE;
  v_target uuid;
  v_logger uuid;
  v_expected numeric := 0;
  v_total numeric := 0;
  v_entry public.bar_tab_entries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar')
                                OR public.is_club_admin_or_permitted(auth.uid(), _club_id, 'finance')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND club_id = _club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status = 'closing' THEN RAISE EXCEPTION 'A payment is in progress on this tab. Cancel it first, then try again.'; END IF;
  IF v_tab.status <> 'open' THEN RAISE EXCEPTION 'This tab has already been settled'; END IF;

  IF EXISTS (SELECT 1 FROM public.bar_tips WHERE tab_id = _tab_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'This tab includes a tip. Settle it at the counter instead.';
  END IF;

  -- A tab already linked to a member can only go to that member.
  v_target := COALESCE(v_tab.club_member_id, _club_member_id);
  IF v_target IS NULL THEN RAISE EXCEPTION 'Choose the member whose account should be charged'; END IF;
  IF v_tab.club_member_id IS NOT NULL AND _club_member_id IS NOT NULL AND _club_member_id <> v_tab.club_member_id THEN
    RAISE EXCEPTION 'This tab belongs to another member';
  END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = v_target AND club_id = _club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF COALESCE(v_member.status::text, 'active') <> 'active' THEN RAISE EXCEPTION 'This membership is not active'; END IF;
  IF COALESCE(v_member.role::text, 'member') = 'visitor' THEN RAISE EXCEPTION 'Visitors cannot charge to an account'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = _club_id
                   AND COALESCE(honesty_bar_enabled, false) AND COALESCE(bar_account_tab_enabled, true)) THEN
    RAISE EXCEPTION 'Member account charges are not enabled for this club';
  END IF;

  SELECT COALESCE(sum(total), 0) INTO v_expected FROM public.bar_visitor_sales
   WHERE guest_tab_id = _tab_id AND payment_status = 'on_tab';
  IF NOT EXISTS (SELECT 1 FROM public.bar_visitor_sales WHERE guest_tab_id = _tab_id AND payment_status = 'on_tab') THEN
    RAISE EXCEPTION 'This tab has no items to charge';
  END IF;

  SELECT id INTO v_logger FROM public.club_members WHERE club_id = _club_id AND user_id = auth.uid() ORDER BY created_at LIMIT 1;

  FOR v_sale IN
    SELECT * FROM public.bar_visitor_sales
     WHERE guest_tab_id = _tab_id AND payment_status = 'on_tab'
     ORDER BY created_at, id
     FOR UPDATE
  LOOP
    UPDATE public.bar_items SET stock_qty = stock_qty + v_sale.quantity, updated_at = now()
     WHERE id = v_sale.bar_item_id AND club_id = _club_id;
    DELETE FROM public.bar_visitor_sales WHERE id = v_sale.id;
    INSERT INTO public.bar_tab_entries (
      club_id, club_member_id, bar_item_id, quantity, unit_price, total,
      logged_by, source, verification_method, verified_at
    ) VALUES (
      _club_id, v_target, v_sale.bar_item_id, v_sale.quantity, v_sale.unit_price, v_sale.total,
      COALESCE(v_logger, v_target), CASE WHEN v_tab.counter_device_id IS NOT NULL THEN 'counter' ELSE 'qr' END,
      'admin', now()
    ) RETURNING * INTO v_entry;
    v_total := v_total + v_entry.total;
  END LOOP;

  -- Never silently reprice: the member must be charged exactly what the tab showed.
  IF v_total <> v_expected THEN
    RAISE EXCEPTION 'Item prices have changed since these were added (tab R%, now R%). Settle this tab at the counter instead.', v_expected, v_total;
  END IF;

  UPDATE public.bar_guest_tabs
     SET status = 'settled', closed_at = now(), settled_method = 'member_account', club_member_id = v_target
   WHERE id = _tab_id;

  INSERT INTO public.bar_tab_payment_events (club_id, tab_id, action, method, amount, reason, actor_user_id)
  VALUES (_club_id, _tab_id, 'moved_to_account', 'member_account', v_total,
          'Open tab put on ' || COALESCE(v_member.name, 'member') || '''s account from Open tabs', auth.uid());

  RETURN jsonb_build_object('ok', true, 'total', v_total, 'member_name', v_member.name);
END;
$function$;

REVOKE ALL ON FUNCTION public.bar_admin_tab_to_member_account(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_admin_tab_to_member_account(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bar_open_tabs(_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar') OR public.is_club_admin_or_permitted(auth.uid(), _club_id, 'finance')) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(t ORDER BY t->>'opened_at')
    FROM (
      SELECT jsonb_build_object(
        'tab_id', g.id,
        'guest_name', g.guest_name,
        'guest_phone', g.guest_phone,
        'status', g.status,
        'opened_at', g.opened_at,
        'club_member_id', g.club_member_id,
        'member_name', m.name,
        'has_tip', EXISTS (SELECT 1 FROM public.bar_tips WHERE tab_id = g.id AND status <> 'cancelled'),
        'operator', COALESCE(NULLIF(g.operator_name, ''), d.label),
        'total', COALESCE((SELECT sum(s.total) FROM public.bar_visitor_sales s WHERE s.guest_tab_id = g.id), 0) + COALESCE((SELECT sum(amount) FROM public.bar_tips WHERE tab_id = g.id AND status <> 'cancelled'), 0),
        'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', b.name, 'quantity', s.quantity, 'total', s.total, 'operator', s.counter_operator_name, 'operator_id', s.counter_device_id)
                                            ORDER BY s.created_at)
                            FROM public.bar_visitor_sales s
                            LEFT JOIN public.bar_items b ON b.id = s.bar_item_id
                           WHERE s.guest_tab_id = g.id), '[]'::jsonb)
      ) AS t
      FROM public.bar_guest_tabs g
      LEFT JOIN public.bar_counter_devices d ON d.id = g.counter_device_id
      LEFT JOIN public.club_members m ON m.id = g.club_member_id
      WHERE g.club_id = _club_id AND g.status IN ('open','closing')
    ) q
  ), '[]'::jsonb);
END;
$function$;