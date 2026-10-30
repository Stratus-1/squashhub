CREATE OR REPLACE FUNCTION public.bar_club_use_unit_cost(_item public.bar_items)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cost numeric;
BEGIN
  IF _item.item_kind='stock' THEN
    RETURN greatest(coalesce(_item.unit_yield,1),1)*coalesce(_item.avg_unit_cost,_item.cost_price/greatest(coalesce(_item.unit_yield,1),1));
  END IF;
  IF _item.item_kind<>'special' THEN RETURN NULL; END IF;
  SELECT CASE WHEN count(*)>0 AND bool_and(ci.club_id=_item.club_id AND ri.club_id=_item.club_id
      AND ci.item_kind IN ('stock','option') AND ri.item_kind='stock'
      AND c.quantity>0 AND public.bar_units_per_sale(ci)>0
      AND coalesce(ri.avg_unit_cost,ri.cost_price/greatest(coalesce(ri.unit_yield,1),1)) IS NOT NULL)
    THEN sum(c.quantity*public.bar_units_per_sale(ci)*coalesce(ri.avg_unit_cost,ri.cost_price/greatest(coalesce(ri.unit_yield,1),1))) END
    INTO v_cost FROM public.bar_special_components c
    LEFT JOIN public.bar_items ci ON ci.id=c.component_item_id
    LEFT JOIN public.bar_items ri ON ri.id=coalesce(ci.stock_parent_id,ci.id)
    WHERE c.special_item_id=_item.id;
  RETURN v_cost;
END $$;
REVOKE ALL ON FUNCTION public.bar_club_use_unit_cost(public.bar_items) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bar_club_use_unit_cost(public.bar_items) TO service_role;
CREATE OR REPLACE FUNCTION public._bar_club_use_post(_item uuid, _qty numeric, _reason text, _source_id uuid DEFAULT NULL, _staff_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it public.bar_items%ROWTYPE; v_units int; v_cost numeric; v_ref uuid; v_desc text; v_offset text; v_mv uuid;
  r record; child jsonb; children jsonb:='[]'::jsonb; v_total numeric:=0;
BEGIN
  SELECT * INTO it FROM public.bar_items WHERE id=_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF _qty IS NULL OR _qty::text IN ('NaN','Infinity','-Infinity') OR _qty<=0 THEN RAISE EXCEPTION 'Enter a quantity above zero'; END IF;
  IF coalesce(btrim(_reason),'')='' THEN RAISE EXCEPTION 'Enter what the club used it for'; END IF;
  IF it.item_kind='special' THEN
    IF NOT public.bar_item_valid_now(it) THEN RAISE EXCEPTION '% is not available right now',it.name; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.bar_special_components WHERE special_item_id=it.id) THEN RAISE EXCEPTION '% has no components set up',it.name; END IF;
    IF EXISTS(SELECT 1 FROM public.bar_special_components c
      LEFT JOIN public.bar_items ci ON ci.id=c.component_item_id
      LEFT JOIN public.bar_items ri ON ri.id=coalesce(ci.stock_parent_id,ci.id)
      WHERE c.special_item_id=it.id AND (ci.id IS NULL OR ri.id IS NULL OR ci.club_id<>it.club_id OR ri.club_id<>it.club_id
        OR ci.item_kind NOT IN ('stock','option') OR ri.item_kind<>'stock' OR c.quantity IS NULL OR c.quantity<=0
        OR public.bar_units_per_sale(ci) IS NULL OR public.bar_units_per_sale(ci)<=0)) THEN
      RAISE EXCEPTION 'Special components must be stock products or serving options from this club';
    END IF;
    FOR r IN SELECT ri.id,ri.unit_yield,sum(c.quantity*public.bar_units_per_sale(ci))*_qty AS units
      FROM public.bar_special_components c JOIN public.bar_items ci ON ci.id=c.component_item_id
      JOIN public.bar_items ri ON ri.id=coalesce(ci.stock_parent_id,ci.id)
      WHERE c.special_item_id=it.id GROUP BY ri.id,ri.unit_yield ORDER BY ri.id LOOP
      IF r.units<>round(r.units) THEN RAISE EXCEPTION 'Special quantity must consume whole stock units'; END IF;
      child:=public._bar_club_use_post(r.id,r.units/greatest(coalesce(r.unit_yield,1),1),it.name||' — '||btrim(_reason),_source_id,_staff_name);
      UPDATE public.bar_stock_movements SET sold_item_id=it.id WHERE id=(child->>'movement_id')::uuid;
      children:=children||jsonb_build_array(child);
      v_total:=v_total+coalesce((child->>'cost')::numeric,0);
    END LOOP;
    RETURN jsonb_build_object('item_id',it.id,'components',children,'cost',v_total);
  END IF;
  IF it.item_kind<>'stock' THEN RAISE EXCEPTION 'Choose the stock product, not a selling option'; END IF;
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
DO $$ DECLARE definition text; updated text; BEGIN
  definition:=pg_get_functiondef('public.bar_counter_board(uuid,uuid)'::regprocedure);
  updated:=replace(definition,'''unit_yield'', i.unit_yield)', '''unit_yield'', i.unit_yield, ''club_use_unit_cost'', public.bar_club_use_unit_cost(i))');
  IF updated=definition THEN RAISE EXCEPTION 'Counter menu cost projection not found'; END IF;
  EXECUTE updated;
END $$;