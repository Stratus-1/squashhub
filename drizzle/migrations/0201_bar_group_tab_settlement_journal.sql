CREATE OR REPLACE FUNCTION public.bar_post_tab_group_journal(_club_id uuid, _tab_id uuid, _method text, _at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ref uuid; v_total numeric; v_count int; v_desc text; v_name text; v_asset gl_account; r record;
BEGIN
  v_ref := md5(_club_id::text || ':tab:' || _tab_id::text || ':' || _method || ':' || _at::text)::uuid;
  -- Re-post the whole settlement so lines inserted in separate statements still give ONE payment.
  DELETE FROM club_journal_entries WHERE journal_ref = v_ref;
  SELECT sum(total), count(*), max(visitor_name) INTO v_total, v_count, v_name FROM bar_visitor_sales
   WHERE club_id = _club_id AND guest_tab_id = _tab_id AND payment_method = _method AND created_at = _at
     AND payment_reference IS NULL AND payment_status IN ('paid','recorded');
  IF COALESCE(v_count, 0) = 0 THEN RETURN; END IF;
  v_asset := CASE WHEN _method = 'cash' THEN 'cash'::gl_account ELSE 'bank_current'::gl_account END;
  v_desc := 'Bar ' || CASE WHEN _method = 'cash' THEN 'cash' ELSE 'card' END || ' payment — ' || COALESCE(v_name, 'guest')
            || ' (' || v_count || ' item' || CASE WHEN v_count = 1 THEN '' ELSE 's' END || ')';
  INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description)
  VALUES (_club_id, v_ref, v_asset, v_total, 0, v_desc);
  FOR r IN SELECT s.total, s.quantity, i.name, public.bar_item_income_account(s.club_id, s.bar_item_id) AS acc
             FROM bar_visitor_sales s LEFT JOIN bar_items i ON i.id = s.bar_item_id
            WHERE s.club_id = _club_id AND s.guest_tab_id = _tab_id AND s.payment_method = _method AND s.created_at = _at
              AND s.payment_reference IS NULL AND s.payment_status IN ('paid','recorded') ORDER BY s.id LOOP
    INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description)
    VALUES (_club_id, v_ref, r.acc, 0, r.total, 'Bar sale: ' || r.quantity || '× ' || COALESCE(r.name, 'item') || COALESCE(' — ' || v_name, ''));
  END LOOP;
  IF _method NOT IN ('cash','account','tab') THEN
    PERFORM post_gateway_fee(_club_id, v_ref, v_total, v_desc);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bar_post_sale_journal(_sale bar_visitor_sales)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ref uuid; v_total numeric; v_count int; v_desc text; r record; v_asset gl_account;
BEGIN
  v_asset := CASE WHEN _sale.payment_method = 'cash' THEN 'cash'::gl_account ELSE 'bank_current'::gl_account END;
  IF _sale.payment_reference IS NULL THEN
    IF _sale.guest_tab_id IS NOT NULL THEN
      PERFORM bar_post_tab_group_journal(_sale.club_id, _sale.guest_tab_id, _sale.payment_method, _sale.created_at);
      RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM club_journal_entries WHERE journal_ref = _sale.id) THEN RETURN; END IF;
    SELECT 'Bar visitor sale (' || _sale.payment_method || '): ' || _sale.quantity::text || '× '
           || COALESCE(name, 'item') || COALESCE(' — ' || _sale.visitor_name, '')
      INTO v_desc FROM bar_items WHERE id = _sale.bar_item_id;
    v_desc := COALESCE(v_desc, 'Bar visitor sale');
    INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description) VALUES
      (_sale.club_id, _sale.id, v_asset, _sale.total, 0, v_desc),
      (_sale.club_id, _sale.id, public.bar_item_income_account(_sale.club_id, _sale.bar_item_id), 0, _sale.total, v_desc);
    IF _sale.payment_method NOT IN ('cash','account','tab') THEN
      PERFORM post_gateway_fee(_sale.club_id, _sale.id, _sale.total, v_desc);
    END IF;
    RETURN;
  END IF;

  v_ref := md5(_sale.club_id::text || ':' || _sale.payment_reference)::uuid;
  IF EXISTS (SELECT 1 FROM club_journal_entries WHERE journal_ref = v_ref) THEN RETURN; END IF;
  SELECT sum(total), count(*) INTO v_total, v_count FROM bar_visitor_sales
   WHERE club_id = _sale.club_id AND payment_reference = _sale.payment_reference
     AND payment_status IN ('paid','recorded');
  v_desc := 'Bar ' || _sale.payment_method || ' payment — ' || COALESCE(_sale.visitor_name, 'guest')
            || ' (' || v_count || ' item' || CASE WHEN v_count = 1 THEN '' ELSE 's' END || ')';
  INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description)
  VALUES (_sale.club_id, v_ref, v_asset, v_total, 0, v_desc);
  FOR r IN SELECT s.total, s.quantity, i.name, public.bar_item_income_account(s.club_id, s.bar_item_id) AS income_account FROM bar_visitor_sales s LEFT JOIN bar_items i ON i.id = s.bar_item_id
            WHERE s.club_id = _sale.club_id AND s.payment_reference = _sale.payment_reference
              AND s.payment_status IN ('paid','recorded') ORDER BY s.created_at LOOP
    INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description)
    VALUES (_sale.club_id, v_ref, r.income_account, 0, r.total,
            'Bar sale: ' || r.quantity || '× ' || COALESCE(r.name, 'item') || COALESCE(' — ' || _sale.visitor_name, ''));
  END LOOP;
  IF _sale.payment_method = 'card' THEN
    PERFORM post_gateway_fee(_sale.club_id, v_ref, v_total, v_desc);
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.bar_unpost_sale_journal(_sale bar_visitor_sales)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM club_journal_entries WHERE journal_ref = _sale.id;
  IF _sale.payment_reference IS NOT NULL THEN
    DELETE FROM club_journal_entries
     WHERE journal_ref = md5(_sale.club_id::text || ':' || _sale.payment_reference)::uuid;
  ELSIF _sale.guest_tab_id IS NOT NULL THEN
    -- Remove the group and re-post whatever lines of that settlement remain.
    DELETE FROM club_journal_entries
     WHERE journal_ref = md5(_sale.club_id::text || ':tab:' || _sale.guest_tab_id::text || ':' || _sale.payment_method || ':' || _sale.created_at::text)::uuid;
    PERFORM bar_post_tab_group_journal(_sale.club_id, _sale.guest_tab_id, _sale.payment_method, _sale.created_at);
  END IF;
END $function$;