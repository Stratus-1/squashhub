CREATE TABLE public.payment_gateway_fee_defaults (
  provider text NOT NULL,
  method text NOT NULL,
  label text NOT NULL,
  fee_pct numeric NOT NULL CHECK (fee_pct >= 0 AND fee_pct <= 20),
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, method)
);
GRANT SELECT ON public.payment_gateway_fee_defaults TO authenticated;
GRANT ALL ON public.payment_gateway_fee_defaults TO service_role;
ALTER TABLE public.payment_gateway_fee_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read default gateway fees" ON public.payment_gateway_fee_defaults FOR SELECT TO authenticated USING (true);
CREATE POLICY "Platform admins manage default gateway fees" ON public.payment_gateway_fee_defaults FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE TABLE public.club_payment_gateway_fees (
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  method text NOT NULL,
  fee_pct numeric NOT NULL CHECK (fee_pct >= 0 AND fee_pct <= 20),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, provider, method)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_payment_gateway_fees TO authenticated;
GRANT ALL ON public.club_payment_gateway_fees TO service_role;
ALTER TABLE public.club_payment_gateway_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Banking or finance read club gateway fees" ON public.club_payment_gateway_fees FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking') OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'));
CREATE POLICY "Banking manages club gateway fees" ON public.club_payment_gateway_fees FOR ALL TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking'))
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'banking'));

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS bar_card_provider text;
COMMENT ON COLUMN public.clubs.bar_card_provider IS 'Card machine used for swipes at the bar (yoco/payfast/stitch); null = online gateway';
COMMENT ON COLUMN public.clubs.gateway_fee_pct_card_local IS 'DEPRECATED: replaced by club_payment_gateway_fees';
COMMENT ON COLUMN public.clubs.gateway_fee_pct_card_intl IS 'DEPRECATED: replaced by club_payment_gateway_fees';
COMMENT ON COLUMN public.clubs.gateway_fee_pct_wallet IS 'DEPRECATED: replaced by club_payment_gateway_fees';
COMMENT ON COLUMN public.clubs.gateway_fee_pct_capitec IS 'DEPRECATED: replaced by club_payment_gateway_fees';
COMMENT ON COLUMN public.clubs.payment_gateway_fee_percent IS 'DEPRECATED: replaced by club_payment_gateway_fees';

-- _method: card_local/card_intl/card -> card; wallet; capitec; bar_card -> bar machine card rate
CREATE OR REPLACE FUNCTION public.club_gateway_fee_percent(_club_id uuid, _method text DEFAULT NULL::text)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_provider text; v_method text; v_pct numeric; c record;
BEGIN
  SELECT payment_gateway, bar_card_provider INTO c FROM public.clubs WHERE id = _club_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF lower(COALESCE(_method,'')) = 'bar_card' THEN
    v_provider := lower(COALESCE(NULLIF(c.bar_card_provider,''), c.payment_gateway, 'payfast'));
    v_method := 'card';
  ELSE
    v_provider := lower(COALESCE(c.payment_gateway, 'payfast'));
    v_method := CASE lower(COALESCE(_method,'')) WHEN 'wallet' THEN 'wallet' WHEN 'capitec' THEN 'capitec' ELSE 'card' END;
  END IF;
  SELECT fee_pct INTO v_pct FROM public.club_payment_gateway_fees WHERE club_id=_club_id AND provider=v_provider AND method=v_method;
  IF v_pct IS NULL THEN SELECT fee_pct INTO v_pct FROM public.payment_gateway_fee_defaults WHERE provider=v_provider AND method=v_method; END IF;
  IF v_pct IS NULL AND v_method <> 'card' THEN
    SELECT fee_pct INTO v_pct FROM public.club_payment_gateway_fees WHERE club_id=_club_id AND provider=v_provider AND method='card';
    IF v_pct IS NULL THEN SELECT fee_pct INTO v_pct FROM public.payment_gateway_fee_defaults WHERE provider=v_provider AND method='card'; END IF;
  END IF;
  RETURN COALESCE(v_pct, 3.70);
END $$;

-- Bar swipes use the bar card machine's rate
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
      PERFORM post_gateway_fee(_sale.club_id, _sale.id, _sale.total, v_desc, NULL, 'bar_card');
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

CREATE OR REPLACE FUNCTION public.bar_post_tab_group_journal(_club_id uuid, _tab_id uuid, _method text, _at timestamp with time zone)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ref uuid; v_total numeric; v_count int; v_desc text; v_name text; v_asset gl_account; r record;
BEGIN
  v_ref := md5(_club_id::text || ':tab:' || _tab_id::text || ':' || _method || ':' || _at::text)::uuid;
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
    PERFORM post_gateway_fee(_club_id, v_ref, v_total, v_desc, NULL, 'bar_card');
  END IF;
END $function$;

-- Banking-only users may also set the bar card machine
CREATE OR REPLACE FUNCTION public.guard_banking_only_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j jsonb; oldj jsonb; cid uuid;
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(),'admin'::public.app_role) THEN RETURN NEW; END IF;
  j := to_jsonb(NEW); oldj := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  IF TG_TABLE_NAME='clubs' THEN
    cid := NEW.id;
    IF public.is_club_admin_or_permitted(auth.uid(),cid,'club') THEN RETURN NEW; END IF;
  ELSE
    cid := (j->>'club_id')::uuid;
    IF public.is_club_secrets_admin(auth.uid(),cid) THEN RETURN NEW; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(j) e
             WHERE e.value IS DISTINCT FROM oldj->e.key
               AND e.key NOT IN ('id','club_id','created_at','updated_at','bar_card_provider')
               AND e.key !~ '(bank|payment|gateway|accepted_payment)') THEN
    RAISE EXCEPTION 'Banking permission only allows bank and payment gateway changes' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;