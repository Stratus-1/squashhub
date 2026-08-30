ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS bar_cash_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.settle_bar_guest_tab(_tab_id uuid, _token uuid, _method text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_tab public.bar_guest_tabs%ROWTYPE; v_club public.clubs%ROWTYPE;
BEGIN
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status <> 'open' THEN RETURN public.get_bar_guest_tab(_tab_id, _token); END IF;
  IF _method NOT IN ('terminal','cash') THEN RAISE EXCEPTION 'Unknown payment method'; END IF;

  SELECT * INTO v_club FROM public.clubs WHERE id = v_tab.club_id;
  IF _method = 'cash' AND NOT COALESCE(v_club.bar_cash_enabled, false) THEN
    RAISE EXCEPTION 'Cash payments are not enabled at this club';
  END IF;
  IF _method = 'terminal' AND COALESCE(v_club.bar_card_swipe_enabled, true) = false THEN
    RAISE EXCEPTION 'Card machine payments are not enabled at this club';
  END IF;

  UPDATE public.bar_visitor_sales
     SET payment_method = CASE WHEN _method = 'cash' THEN 'cash' ELSE 'card' END,
         payment_status = CASE WHEN _method = 'cash' THEN 'awaiting_cash' ELSE 'awaiting_terminal' END,
         note = CASE WHEN _method = 'cash'
                     THEN 'Bar tab · pay cash at the bar'
                     ELSE 'Bar tab · card machine at the club' END
   WHERE guest_tab_id = _tab_id AND payment_status = 'on_tab';

  UPDATE public.bar_guest_tabs
     SET status = 'closing', closed_at = now(), settled_method = _method
   WHERE id = _tab_id;

  RETURN public.get_bar_guest_tab(_tab_id, _token);
END; $fn$;

GRANT EXECUTE ON FUNCTION public.settle_bar_guest_tab(uuid, uuid, text) TO anon, authenticated, service_role;