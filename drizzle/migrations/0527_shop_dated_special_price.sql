CREATE OR REPLACE FUNCTION public.shop_effective_price(_regular numeric, _options jsonb, _at timestamptz DEFAULT now()) RETURNS numeric LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE s jsonb := _options->'special'; p numeric; d date;
BEGIN
 IF s IS NULL OR s = 'null'::jsonb THEN RETURN _regular; END IF;
 BEGIN p := (s->>'price')::numeric; d := (s->>'until')::date; EXCEPTION WHEN OTHERS THEN RETURN _regular; END;
 IF p >= 0 AND p < _regular AND (_at AT TIME ZONE 'Africa/Johannesburg')::date <= d THEN RETURN p; END IF;
 RETURN _regular;
END $$;
GRANT EXECUTE ON FUNCTION public.shop_effective_price(numeric,jsonb,timestamptz) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shop_validate_special() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE s jsonb := NEW.order_options->'special'; p numeric; d date;
BEGIN
 IF s IS NULL OR s = 'null'::jsonb THEN RETURN NEW; END IF;
 BEGIN p := (s->>'price')::numeric; d := (s->>'until')::date; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Choose a valid special price and end date'; END;
 IF p IS NULL OR d IS NULL OR p < 0 OR p >= NEW.price OR p::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Special price must be less than the regular price and have an end date'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shop_validate_special BEFORE INSERT OR UPDATE OF order_options,price ON public.bar_items FOR EACH ROW EXECUTE FUNCTION public.shop_validate_special();

DO $$
DECLARE r record; definition text;
BEGIN
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.proname IN ('add_to_bar_guest_tab','record_bar_terminal_sale','bar_qr_charge_member_session','qr_record_visitor_sale','charge_bar_to_member','bar_qr_charge_member','record_bar_counter_visitor_sale','bar_submit_guest_order','bar_counter_add_to_tab','shop_place_order') AND p.prosrc LIKE '%v_item.price%'
 LOOP
  definition := pg_get_functiondef(r.oid);
  definition := replace(definition, 'v_item.price', 'public.shop_effective_price(v_item.price, v_item.order_options)');
  EXECUTE definition;
 END LOOP;
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='resolve_qr_short_code'
 LOOP
  definition := pg_get_functiondef(r.oid);
  definition := replace(definition, '''price'', b.price', '''price'', public.shop_effective_price(b.price,b.order_options)');
  EXECUTE definition;
 END LOOP;
END $$;