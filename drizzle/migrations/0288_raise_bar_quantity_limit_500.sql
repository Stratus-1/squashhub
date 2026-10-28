DO $$
DECLARE r record; d text;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND p.proname IN ('record_bar_terminal_sale','qr_record_visitor_sale','charge_bar_to_member','bar_qr_charge_member','add_to_bar_guest_tab','record_bar_counter_visitor_sale','bar_submit_guest_order','bar_qr_charge_member_session')
  LOOP
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'v_qty > 50 THEN', 'v_qty > 500 THEN');
    d := replace(d, '_quantity > 50 THEN', '_quantity > 500 THEN');
    EXECUTE d;
  END LOOP;
END $$;