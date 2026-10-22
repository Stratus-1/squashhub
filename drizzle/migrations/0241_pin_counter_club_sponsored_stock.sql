CREATE TABLE public.bar_club_use_requests (
  id uuid PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  device_id uuid NOT NULL REFERENCES public.bar_counter_devices(id),
  staff_name text NOT NULL,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bar_club_use_requests TO service_role;
ALTER TABLE public.bar_club_use_requests ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.bar_club_use_requests IS 'Private idempotency and serving-identity audit for PIN-authorised sponsored-stock baskets; no direct client access.';

CREATE OR REPLACE FUNCTION public._bar_club_use_post(_item uuid, _qty numeric, _reason text, _source_id uuid DEFAULT NULL, _staff_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it public.bar_items%ROWTYPE; v_units int; v_cost numeric; v_ref uuid; v_desc text; v_offset text; v_mv uuid;
BEGIN
  SELECT * INTO it FROM public.bar_items WHERE id=_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF it.item_kind<>'stock' THEN RAISE EXCEPTION 'Choose the stock product, not a selling option or special'; END IF;
  IF _qty IS NULL OR _qty::text IN ('NaN','Infinity','-Infinity') OR _qty<=0 THEN RAISE EXCEPTION 'Enter a quantity above zero'; END IF;
  IF coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Enter what the club used it for'; END IF;
  v_units:=round(_qty*greatest(coalesce(it.unit_yield,1),1))::int;
  IF v_units<=0 THEN RAISE EXCEPTION 'Enter a quantity above zero'; END IF;
  IF public.bar_allow_negative_stock(it.club_id) THEN PERFORM set_config('sh.bar_allow_negative','1',true); END IF;
  PERFORM public.bar_stock_apply(it.id,-v_units,'club_use','club_use',_source_id,NULL,false);
  PERFORM set_config('sh.bar_allow_negative','',true);
  SELECT id INTO v_mv FROM public.bar_stock_movements WHERE bar_item_id=it.id AND reason='club_use' ORDER BY created_at DESC,id DESC LIMIT 1;
  v_desc:='Club sponsored: '||_qty::text||' × '||it.name||' — '||btrim(_reason)
    ||CASE WHEN _staff_name IS NOT NULL THEN ' · Serving: '||_staff_name ELSE '' END;
  UPDATE public.bar_stock_movements SET note=v_desc WHERE id=v_mv;
  v_cost:=round(v_units*coalesce(it.avg_unit_cost,it.cost_price/greatest(coalesce(it.unit_yield,1),1),0),2);
  IF v_cost>0 THEN
    v_ref:=gen_random_uuid();
    v_offset:=CASE WHEN coalesce(it.division,'bar')='shop' THEN 'shop_expense' ELSE 'bar_expense' END;
    INSERT INTO public.club_journal_entries(club_id,journal_ref,account,debit,credit,description) VALUES
      (it.club_id,v_ref,'club_stock_expense'::public.gl_account,v_cost,0,v_desc),
      (it.club_id,v_ref,v_offset::public.gl_account,0,v_cost,v_desc);
  END IF;
  RETURN jsonb_build_object('movement_id',v_mv,'units',v_units,'cost',v_cost,'journal_ref',v_ref);
END $$;
REVOKE ALL ON FUNCTION public._bar_club_use_post(uuid,numeric,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._bar_club_use_post(uuid,numeric,text,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.bar_club_use(_item uuid,_qty numeric,_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE club uuid;
BEGIN
  SELECT club_id INTO club FROM public.bar_items WHERE id=_item;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(),club,'bar') THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  RETURN public._bar_club_use_post(_item,_qty,_reason);
END $$;

CREATE OR REPLACE FUNCTION public.bar_counter_club_use(_token uuid,_lines jsonb,_reason text,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE club uuid; device uuid; staff text; prior public.bar_club_use_requests; payload jsonb; line jsonb; it public.bar_items%ROWTYPE;
  result jsonb; results jsonb:='[]'::jsonb; cost numeric:=0;
BEGIN
  IF _token IS NULL THEN RAISE EXCEPTION 'Personal counter PIN required'; END IF;
  SELECT s.club_id,s.device_id,d.label INTO club,device,staff
    FROM public.bar_counter_sessions s JOIN public.bar_counter_devices d ON d.id=s.device_id AND d.club_id=s.club_id
    WHERE s.token=_token AND s.revoked_at IS NULL AND s.expires_at>now() AND d.active AND nullif(btrim(d.label),'') IS NOT NULL
    FOR SHARE OF s,d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Personal counter PIN required'; END IF;
  PERFORM public._bar_tip_authorise(club,_token);
  IF _request_id IS NULL THEN RAISE EXCEPTION 'Request reference required'; END IF;
  IF _lines IS NULL OR jsonb_typeof(_lines)<>'array' THEN RAISE EXCEPTION 'Choose stock items'; END IF;
  IF jsonb_array_length(_lines)=0 OR jsonb_array_length(_lines)>100 THEN RAISE EXCEPTION 'Choose between 1 and 100 stock items'; END IF;
  IF nullif(btrim(coalesce(_reason,'')),'') IS NULL OR length(_reason)>120 THEN RAISE EXCEPTION 'Enter what the club used it for (up to 120 characters)'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_lines))<>(SELECT count(DISTINCT x->>'item_id') FROM jsonb_array_elements(_lines) x) THEN RAISE EXCEPTION 'Duplicate stock item'; END IF;
  SELECT jsonb_build_object('lines',jsonb_agg(x ORDER BY x->>'item_id'),'reason',btrim(_reason)) INTO payload FROM jsonb_array_elements(_lines) x;
  PERFORM pg_advisory_xact_lock(hashtext('bar_club_use_request:'||_request_id));
  SELECT * INTO prior FROM public.bar_club_use_requests WHERE id=_request_id;
  IF FOUND THEN
    IF prior.club_id<>club OR prior.device_id<>device OR prior.payload<>payload THEN RAISE EXCEPTION 'Club-sponsored retry does not match'; END IF;
    RETURN prior.result;
  END IF;
  FOR line IN SELECT x FROM jsonb_array_elements(_lines) x ORDER BY x->>'item_id' LOOP
    SELECT * INTO it FROM public.bar_items WHERE id=(line->>'item_id')::uuid AND club_id=club FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found in this club'; END IF;
    result:=public._bar_club_use_post(it.id,(line->>'quantity')::numeric,btrim(_reason),_request_id,staff);
    results:=results||jsonb_build_array(result);
    cost:=cost+coalesce((result->>'cost')::numeric,0);
  END LOOP;
  result:=jsonb_build_object('lines',results,'cost',cost,'staff_name',staff);
  INSERT INTO public.bar_club_use_requests(id,club_id,device_id,staff_name,payload,result) VALUES(_request_id,club,device,staff,payload,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bar_counter_club_use(uuid,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bar_counter_club_use(uuid,jsonb,text,uuid) TO anon,authenticated;