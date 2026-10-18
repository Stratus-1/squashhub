ALTER TABLE public.bar_visitor_sales ADD COLUMN IF NOT EXISTS counter_operator_name text;
ALTER TABLE public.bar_tab_entries ADD COLUMN IF NOT EXISTS counter_operator_id uuid REFERENCES public.bar_counter_devices(id), ADD COLUMN IF NOT EXISTS counter_operator_name text;

CREATE OR REPLACE FUNCTION public.bar_counter_open_tab(_guest_name text, _token uuid DEFAULT NULL, _club_id uuid DEFAULT NULL, _guest_phone text DEFAULT NULL, _operator text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_club uuid; v_id uuid; v_dev uuid; v_name text;
BEGIN
 v_club := public.bar_counter_context(_token, _club_id);
 SELECT d.id,d.label INTO v_dev,v_name FROM public.bar_counter_sessions s JOIN public.bar_counter_devices d ON d.id=s.device_id AND d.club_id=s.club_id WHERE s.token=_token AND s.club_id=v_club AND s.revoked_at IS NULL AND s.expires_at>now() AND d.active;
 IF v_dev IS NULL OR nullif(btrim(v_name),'') IS NULL THEN RAISE EXCEPTION 'Unlock counter with your personal PIN again'; END IF;
 IF btrim(coalesce(_guest_name,''))='' THEN RAISE EXCEPTION 'Please give a name for the tab'; END IF;
 INSERT INTO public.bar_guest_tabs(club_id,guest_name,guest_phone,counter_device_id,operator_name) VALUES(v_club,left(btrim(_guest_name),80),nullif(left(btrim(coalesce(_guest_phone,'')),30),''),v_dev,v_name) RETURNING id INTO v_id;
 RETURN jsonb_build_object('tab_id',v_id);
END $$;

CREATE OR REPLACE FUNCTION public.bar_counter_add_to_tab(_tab_id uuid,_lines jsonb,_token uuid DEFAULT NULL,_club_id uuid DEFAULT NULL,_operator text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_club uuid; v_tab public.bar_guest_tabs; v_dev uuid; v_name text; v_line jsonb; v_item public.bar_items; v_qty int;
BEGIN
 v_club:=public.bar_counter_context(_token,_club_id);
 SELECT d.id,d.label INTO v_dev,v_name FROM public.bar_counter_sessions s JOIN public.bar_counter_devices d ON d.id=s.device_id AND d.club_id=s.club_id WHERE s.token=_token AND s.club_id=v_club AND s.revoked_at IS NULL AND s.expires_at>now() AND d.active;
 IF v_dev IS NULL OR nullif(btrim(v_name),'') IS NULL THEN RAISE EXCEPTION 'Unlock counter with your personal PIN again'; END IF;
 SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id=_tab_id AND club_id=v_club FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
 IF v_tab.status<>'open' THEN RAISE EXCEPTION 'This tab has already been settled'; END IF;
 IF _lines IS NULL OR jsonb_typeof(_lines)<>'array' OR jsonb_array_length(_lines)=0 OR jsonb_array_length(_lines)>30 THEN RAISE EXCEPTION 'Nothing to add'; END IF;
 FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
  v_qty:=coalesce((v_line->>'quantity')::int,0);
  IF v_qty<1 OR v_qty>50 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  SELECT * INTO v_item FROM public.bar_items WHERE id=(v_line->>'bar_item_id')::uuid AND club_id=v_club AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'One or more items are not available'; END IF;
  INSERT INTO public.bar_visitor_sales(club_id,bar_item_id,quantity,unit_price,total,payment_method,visitor_name,note,payment_status,guest_tab_id,counter_device_id,counter_operator_name)
  VALUES(v_club,v_item.id,v_qty,v_item.price,v_item.price*v_qty,'tab',v_tab.guest_name,'Open bar tab','on_tab',v_tab.id,v_dev,v_name);
 END LOOP;
 UPDATE public.bar_guest_tabs SET operator_name=v_name,counter_device_id=v_dev WHERE id=_tab_id;
 RETURN public.get_bar_guest_tab(_tab_id,v_tab.token);
END $$;

DO $patch$
DECLARE v_def text;
BEGIN
 SELECT pg_get_functiondef('public.bar_qr_charge_guest_tab_member(uuid,uuid,uuid,text)'::regprocedure) INTO v_def;
 IF position('logged_by, source, verification_method, verified_at' IN v_def)=0 THEN RAISE EXCEPTION 'Member conversion definition changed'; END IF;
 v_def:=replace(v_def,'logged_by, source, verification_method, verified_at','logged_by, source, verification_method, verified_at, counter_operator_id, counter_operator_name');
 v_def:=replace(v_def,'''qr'', ''otp'', now()', '''qr'', ''otp'', now(), v_sale.counter_device_id, v_sale.counter_operator_name');
 EXECUTE v_def;
 SELECT pg_get_functiondef('public.bar_open_tabs(uuid)'::regprocedure) INTO v_def;
 v_def:=replace(v_def,'''name'', b.name, ''quantity'', s.quantity, ''total'', s.total','''name'', b.name, ''quantity'', s.quantity, ''total'', s.total, ''operator'', s.counter_operator_name, ''operator_id'', s.counter_device_id');
 EXECUTE v_def;
END $patch$;