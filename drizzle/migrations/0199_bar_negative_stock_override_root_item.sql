CREATE OR REPLACE FUNCTION public.bar_consume_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE it public.bar_items%ROWTYPE; r record; v_neg boolean;
BEGIN
  SELECT * INTO it FROM public.bar_items WHERE id = NEW.bar_item_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF it.item_kind = 'made_to_order' THEN RETURN NEW; END IF;
  v_neg := COALESCE(it.allow_negative_stock, public.bar_allow_negative_stock(it.club_id));

  IF it.item_kind = 'special' THEN
    IF NOT public.bar_item_valid_now(it) THEN RAISE EXCEPTION '% is not available right now', it.name; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bar_special_components WHERE special_item_id = it.id) THEN
      RAISE EXCEPTION '% has no components set up', it.name;
    END IF;
    FOR r IN
      SELECT ri.id AS root,
             sum(c.quantity * public.bar_units_per_sale(ci)) * NEW.quantity AS units,
             bool_or(COALESCE(ri.allow_negative_stock, ci.allow_negative_stock, v_neg)) AS neg
        FROM public.bar_special_components c
        JOIN public.bar_items ci ON ci.id = c.component_item_id
        JOIN public.bar_items ri ON ri.id = COALESCE(ci.stock_parent_id, ci.id)
       WHERE c.special_item_id = it.id GROUP BY 1
    LOOP
      PERFORM 1 FROM public.bar_items WHERE id = r.root AND (r.neg OR stock_units >= r.units) FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Not enough stock for %', it.name; END IF;
    END LOOP;
    FOR r IN
      SELECT ri.id AS root,
             sum(c.quantity * public.bar_units_per_sale(ci)) * NEW.quantity AS units,
             bool_or(COALESCE(ri.allow_negative_stock, ci.allow_negative_stock, v_neg)) AS neg
        FROM public.bar_special_components c
        JOIN public.bar_items ci ON ci.id = c.component_item_id
        JOIN public.bar_items ri ON ri.id = COALESCE(ci.stock_parent_id, ci.id)
       WHERE c.special_item_id = it.id GROUP BY 1
    LOOP
      IF r.neg THEN PERFORM set_config('sh.bar_allow_negative', '1', true); END IF;
      PERFORM public.bar_stock_apply(r.root, -r.units::int, 'special_sale', TG_TABLE_NAME, NEW.id, it.id, false);
      PERFORM set_config('sh.bar_allow_negative', '', true);
    END LOOP;
  ELSE
    -- The stock-holding item (parent product for options) may override the club setting.
    SELECT COALESCE(p.allow_negative_stock, v_neg) INTO v_neg
      FROM public.bar_items p WHERE p.id = COALESCE(it.stock_parent_id, it.id);
    IF v_neg THEN PERFORM set_config('sh.bar_allow_negative', '1', true); END IF;
    PERFORM public.bar_stock_apply(COALESCE(it.stock_parent_id, it.id),
                                   -(NEW.quantity * public.bar_units_per_sale(it)),
                                   'sale', TG_TABLE_NAME, NEW.id, it.id, false);
    PERFORM set_config('sh.bar_allow_negative', '', true);
  END IF;
  RETURN NEW;
END $function$;