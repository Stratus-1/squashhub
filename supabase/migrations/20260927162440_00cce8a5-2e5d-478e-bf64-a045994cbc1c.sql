ALTER TABLE public.club_bar_settings ADD COLUMN IF NOT EXISTS allow_negative_stock boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.bar_allow_negative_stock(_club uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT allow_negative_stock FROM public.club_bar_settings WHERE club_id = _club), true)
$$;

CREATE OR REPLACE FUNCTION public.bar_stock_apply(_item uuid, _delta integer, _reason text, _source_table text DEFAULT NULL::text, _source_id uuid DEFAULT NULL::uuid, _sold_item uuid DEFAULT NULL::uuid, _clamp boolean DEFAULT true, _purchase_cost_per_unit numeric DEFAULT NULL::numeric)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v public.bar_items%ROWTYPE; v_new int; v_costing boolean; v_before numeric; v_after numeric;
        v_unit numeric; v_value numeric; v_onhand int;
BEGIN
  SELECT * INTO v FROM public.bar_items WHERE id = _item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;
  IF v.item_kind <> 'stock' THEN RAISE EXCEPTION 'Stock can only be held by a stock product'; END IF;
  v_new := v.stock_units + _delta;
  IF _clamp THEN v_new := GREATEST(v_new, 0); END IF;
  IF v_new < 0 AND COALESCE(current_setting('sh.bar_allow_negative', true), '') <> '1' THEN
    RAISE EXCEPTION 'Not enough stock of %', v.name;
  END IF;

  v_costing := public.bar_costing_enabled(v.club_id);
  v_before := v.avg_unit_cost; v_after := v.avg_unit_cost;
  IF v_costing THEN
    IF _reason = 'purchase' AND _purchase_cost_per_unit IS NOT NULL AND _purchase_cost_per_unit >= 0 AND _delta > 0 THEN
      v_onhand := GREATEST(v.stock_units, 0);
      IF v_before IS NULL OR v_onhand = 0 THEN
        v_after := _purchase_cost_per_unit;
      ELSE
        v_after := (v_onhand * v_before + _delta * _purchase_cost_per_unit) / (v_onhand + _delta);
      END IF;
      v_unit := _purchase_cost_per_unit;
      v_value := round(_delta * _purchase_cost_per_unit, 4);
    ELSIF v_before IS NOT NULL THEN
      v_unit := v_before;
      v_value := round((CASE WHEN _reason IN ('sale','special_sale') THEN _delta ELSE v_new - v.stock_units END) * v_before, 4);
    END IF;
  END IF;

  PERFORM set_config('sh.bar_stock_apply', '1', true);
  PERFORM set_config('sh.bar_cost_apply', '1', true);
  UPDATE public.bar_items SET stock_units = v_new, avg_unit_cost = v_after, updated_at = now() WHERE id = _item;
  PERFORM set_config('sh.bar_cost_apply', '', true);
  PERFORM set_config('sh.bar_stock_apply', '', true);
  INSERT INTO public.bar_stock_movements (club_id, bar_item_id, units_delta, requested_delta, units_after,
       reason, source_table, source_id, sold_item_id, created_by, unit_cost, cost_value, avg_cost_before, avg_cost_after)
  VALUES (v.club_id, _item, v_new - v.stock_units, _delta, v_new, _reason, _source_table, _source_id, _sold_item, auth.uid(),
       v_unit, v_value, CASE WHEN v_costing THEN v_before END, CASE WHEN v_costing THEN v_after END);
  RETURN v_new;
END $function$;

CREATE OR REPLACE FUNCTION public.bar_consume_sale()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE it public.bar_items%ROWTYPE; r record; v_neg boolean;
BEGIN
  SELECT * INTO it FROM public.bar_items WHERE id = NEW.bar_item_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_neg := public.bar_allow_negative_stock(it.club_id);

  IF it.item_kind = 'special' THEN
    IF NOT public.bar_item_valid_now(it) THEN RAISE EXCEPTION '% is not available right now', it.name; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bar_special_components WHERE special_item_id = it.id) THEN
      RAISE EXCEPTION '% has no components set up', it.name;
    END IF;
    FOR r IN
      SELECT COALESCE(ci.stock_parent_id, ci.id) AS root,
             sum(c.quantity * public.bar_units_per_sale(ci)) * NEW.quantity AS units
        FROM public.bar_special_components c JOIN public.bar_items ci ON ci.id = c.component_item_id
       WHERE c.special_item_id = it.id GROUP BY 1
    LOOP
      PERFORM 1 FROM public.bar_items WHERE id = r.root AND (v_neg OR stock_units >= r.units) FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Not enough stock for %', it.name; END IF;
    END LOOP;
    IF v_neg THEN PERFORM set_config('sh.bar_allow_negative', '1', true); END IF;
    FOR r IN
      SELECT COALESCE(ci.stock_parent_id, ci.id) AS root,
             sum(c.quantity * public.bar_units_per_sale(ci)) * NEW.quantity AS units
        FROM public.bar_special_components c JOIN public.bar_items ci ON ci.id = c.component_item_id
       WHERE c.special_item_id = it.id GROUP BY 1
    LOOP
      PERFORM public.bar_stock_apply(r.root, -r.units::int, 'special_sale', TG_TABLE_NAME, NEW.id, it.id, false);
    END LOOP;
    PERFORM set_config('sh.bar_allow_negative', '', true);
  ELSE
    IF v_neg THEN PERFORM set_config('sh.bar_allow_negative', '1', true); END IF;
    PERFORM public.bar_stock_apply(COALESCE(it.stock_parent_id, it.id),
                                   -(NEW.quantity * public.bar_units_per_sale(it)),
                                   'sale', TG_TABLE_NAME, NEW.id, it.id, false);
    PERFORM set_config('sh.bar_allow_negative', '', true);
  END IF;
  RETURN NEW;
END $function$;