-- Reuse the existing member-account tab settlement for Firebase Player API
-- sessions. Normal web calls continue to use auth.uid(); the additional
-- defaulted secret is only accepted from the trusted GCP Player API.
DROP FUNCTION IF EXISTS public.bar_qr_charge_guest_tab_member_session(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.bar_qr_charge_guest_tab_member_session(
  _tab_id uuid,
  _token uuid,
  _club_member_id uuid,
  _sync_secret text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_tab public.bar_guest_tabs%ROWTYPE;
  v_member public.club_members%ROWTYPE;
  v_sale public.bar_visitor_sales%ROWTYPE;
  v_total numeric := 0;
  v_first uuid;
  v_entry_id uuid;
BEGIN
  IF _sync_secret IS NOT NULL THEN
    IF NOT public.mobile_internal_secret_ok(_sync_secret) THEN
      RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
    END IF;
  ELSIF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to charge to your member account' USING ERRCODE='42501';
  END IF;

  PERFORM set_config('app.chairman_self_payment', 'on', true);
  SELECT * INTO v_tab FROM public.bar_guest_tabs
   WHERE id = _tab_id AND token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status <> 'open' THEN RAISE EXCEPTION 'This tab has already been settled'; END IF;

  SELECT * INTO v_member FROM public.club_members
   WHERE id = _club_member_id AND club_id = v_tab.club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF COALESCE(v_member.status, 'active') <> 'active' THEN RAISE EXCEPTION 'This membership is not active'; END IF;
  IF COALESCE(v_member.role::text, 'member') = 'visitor' THEN RAISE EXCEPTION 'Visitors cannot charge to an account'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clubs
     WHERE id = v_tab.club_id
       AND COALESCE(honesty_bar_enabled, false)
       AND COALESCE(bar_account_tab_enabled, true)
  ) THEN
    RAISE EXCEPTION 'Member account charges are not enabled for this club';
  END IF;

  IF _sync_secret IS NULL AND NOT (
    v_member.user_id = auth.uid()
    OR (v_member.email IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND lower(p.email) = lower(v_member.email)
    ))
  ) THEN
    RAISE EXCEPTION 'This membership does not belong to the signed-in account';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.bar_visitor_sales WHERE guest_tab_id = _tab_id AND payment_status = 'on_tab') THEN
    RAISE EXCEPTION 'This tab has no items to charge';
  END IF;

  FOR v_sale IN
    SELECT * FROM public.bar_visitor_sales
     WHERE guest_tab_id = _tab_id AND payment_status = 'on_tab'
     ORDER BY created_at, id FOR UPDATE
  LOOP
    UPDATE public.bar_items
       SET stock_qty = stock_qty + v_sale.quantity, updated_at = now()
     WHERE id = v_sale.bar_item_id AND club_id = v_tab.club_id;
    DELETE FROM public.bar_visitor_sales WHERE id = v_sale.id;
    INSERT INTO public.bar_tab_entries (
      club_id, club_member_id, bar_item_id, quantity, unit_price, total,
      logged_by, source, verification_method, verified_at
    ) VALUES (
      v_tab.club_id, _club_member_id, v_sale.bar_item_id, v_sale.quantity,
      v_sale.unit_price, v_sale.total, _club_member_id, 'qr',
      CASE WHEN _sync_secret IS NULL THEN 'session' ELSE 'mobile_session' END, now()
    ) RETURNING id INTO v_entry_id;
    v_first := COALESCE(v_first, v_entry_id);
    v_total := v_total + v_sale.total;
  END LOOP;

  UPDATE public.bar_guest_tabs
     SET status = 'settled', closed_at = now(), settled_method = 'member_account',
         club_member_id = _club_member_id
   WHERE id = _tab_id;

  RETURN jsonb_build_object('ok', true, 'entry_id', v_first, 'total', v_total,
    'member_name', v_member.name, 'verification', CASE WHEN _sync_secret IS NULL THEN 'session' ELSE 'mobile_session' END);
END;
$function$;

REVOKE ALL ON FUNCTION public.bar_qr_charge_guest_tab_member_session(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_qr_charge_guest_tab_member_session(uuid, uuid, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
