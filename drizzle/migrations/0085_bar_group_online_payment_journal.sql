CREATE OR REPLACE FUNCTION public.bar_post_sale_journal(_sale public.bar_visitor_sales)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ref uuid; v_total numeric; v_count int; v_desc text; r record;
BEGIN
  IF _sale.payment_reference IS NULL THEN
    IF EXISTS (SELECT 1 FROM club_journal_entries WHERE journal_ref = _sale.id) THEN RETURN; END IF;
    SELECT 'Bar visitor sale (' || _sale.payment_method || '): ' || _sale.quantity::text || '× '
           || COALESCE(name, 'item') || COALESCE(' — ' || _sale.visitor_name, '')
      INTO v_desc FROM bar_items WHERE id = _sale.bar_item_id;
    v_desc := COALESCE(v_desc, 'Bar visitor sale');
    INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description) VALUES
      (_sale.club_id, _sale.id, 'bank_current', _sale.total, 0, v_desc),
      (_sale.club_id, _sale.id, 'bar_income', 0, _sale.total, v_desc);
    IF _sale.payment_method = 'card' THEN
      PERFORM post_gateway_fee(_sale.club_id, _sale.id, _sale.total, v_desc);
    END IF;
    RETURN;
  END IF;

  -- One online payment covering several lines: one bank receipt + one gateway fee,
  -- income still itemised per line, all under one journal ref per payment.
  v_ref := md5(_sale.club_id::text || ':' || _sale.payment_reference)::uuid;
  IF EXISTS (SELECT 1 FROM club_journal_entries WHERE journal_ref = v_ref) THEN RETURN; END IF;
  SELECT sum(total), count(*) INTO v_total, v_count FROM bar_visitor_sales
   WHERE club_id = _sale.club_id AND payment_reference = _sale.payment_reference
     AND payment_status IN ('paid','recorded');
  v_desc := 'Bar ' || _sale.payment_method || ' payment — ' || COALESCE(_sale.visitor_name, 'guest')
            || ' (' || v_count || ' item' || CASE WHEN v_count = 1 THEN '' ELSE 's' END || ')';
  INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description)
  VALUES (_sale.club_id, v_ref, 'bank_current', v_total, 0, v_desc);
  FOR r IN SELECT s.total, s.quantity, i.name FROM bar_visitor_sales s LEFT JOIN bar_items i ON i.id = s.bar_item_id
            WHERE s.club_id = _sale.club_id AND s.payment_reference = _sale.payment_reference
              AND s.payment_status IN ('paid','recorded') ORDER BY s.created_at LOOP
    INSERT INTO club_journal_entries (club_id, journal_ref, account, debit, credit, description)
    VALUES (_sale.club_id, v_ref, 'bar_income', 0, r.total,
            'Bar sale: ' || r.quantity || '× ' || COALESCE(r.name, 'item') || COALESCE(' — ' || _sale.visitor_name, ''));
  END LOOP;
  IF _sale.payment_method = 'card' THEN
    PERFORM post_gateway_fee(_sale.club_id, v_ref, v_total, v_desc);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bar_unpost_sale_journal(_sale public.bar_visitor_sales)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM club_journal_entries WHERE journal_ref = _sale.id;
  IF _sale.payment_reference IS NOT NULL THEN
    DELETE FROM club_journal_entries
     WHERE journal_ref = md5(_sale.club_id::text || ':' || _sale.payment_reference)::uuid;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bar_visitor_sale_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status IN ('paid','recorded') THEN PERFORM bar_post_sale_journal(NEW); END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM bar_unpost_sale_journal(OLD);
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.bar_visitor_sale_journal_on_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN RETURN NEW; END IF;
  IF NEW.payment_status IN ('paid','recorded') THEN
    PERFORM bar_post_sale_journal(NEW);
  ELSIF NEW.payment_status = 'failed' THEN
    PERFORM bar_unpost_sale_journal(OLD);
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.bar_post_sale_journal(public.bar_visitor_sales) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bar_unpost_sale_journal(public.bar_visitor_sales) FROM PUBLIC, anon, authenticated;