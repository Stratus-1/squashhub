CREATE TABLE public.club_bar_settings (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  costing_enabled boolean NOT NULL DEFAULT false,
  costing_enabled_at timestamptz,
  costing_enabled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.club_bar_settings TO authenticated;
GRANT ALL ON public.club_bar_settings TO service_role;
ALTER TABLE public.club_bar_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bar admins read bar settings" ON public.club_bar_settings FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));
CREATE POLICY "Bar admins insert bar settings" ON public.club_bar_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));
CREATE POLICY "Bar admins update bar settings" ON public.club_bar_settings FOR UPDATE TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'))
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));

CREATE OR REPLACE FUNCTION public.club_bar_settings_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.costing_enabled AND (TG_OP = 'INSERT' OR NOT OLD.costing_enabled) THEN
    NEW.costing_enabled_at := now(); NEW.costing_enabled_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_club_bar_settings_touch BEFORE INSERT OR UPDATE ON public.club_bar_settings
  FOR EACH ROW EXECUTE FUNCTION public.club_bar_settings_touch();

CREATE OR REPLACE FUNCTION public.bar_costing_enabled(_club uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT costing_enabled FROM public.club_bar_settings WHERE club_id = _club), false)
$$;

ALTER TABLE public.bar_items ADD COLUMN avg_unit_cost numeric(18,8)
  CHECK (avg_unit_cost IS NULL OR avg_unit_cost >= 0);
ALTER TABLE public.bar_stock_movements
  ADD COLUMN unit_cost numeric(18,8),
  ADD COLUMN cost_value numeric(14,4),
  ADD COLUMN avg_cost_before numeric(18,8),
  ADD COLUMN avg_cost_after numeric(18,8),
  ADD COLUMN note text;

-- Guard: avg_unit_cost only changes via the costing functions.
CREATE OR REPLACE FUNCTION public.bar_items_guard_avg_cost() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.avg_unit_cost IS DISTINCT FROM OLD.avg_unit_cost
     AND COALESCE(current_setting('sh.bar_cost_apply', true), '') <> '1' THEN
    NEW.avg_unit_cost := OLD.avg_unit_cost;
  END IF;
  -- Yield change on the same physical bottles: keep bottle cost, rescale per-unit cost.
  IF NEW.unit_yield <> OLD.unit_yield AND OLD.avg_unit_cost IS NOT NULL AND NEW.unit_yield > 0 THEN
    NEW.avg_unit_cost := OLD.avg_unit_cost * OLD.unit_yield / NEW.unit_yield;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_bar_items_guard_avg_cost BEFORE UPDATE ON public.bar_items
  FOR EACH ROW EXECUTE FUNCTION public.bar_items_guard_avg_cost();

DROP FUNCTION IF EXISTS public.bar_stock_apply(uuid, integer, text, text, uuid, uuid, boolean);
CREATE FUNCTION public.bar_stock_apply(_item uuid, _delta integer, _reason text, _source_table text DEFAULT NULL,
  _source_id uuid DEFAULT NULL, _sold_item uuid DEFAULT NULL, _clamp boolean DEFAULT true,
  _purchase_cost_per_unit numeric DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.bar_items%ROWTYPE; v_new int; v_costing boolean; v_before numeric; v_after numeric;
        v_unit numeric; v_value numeric; v_onhand int;
BEGIN
  SELECT * INTO v FROM public.bar_items WHERE id = _item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;
  IF v.item_kind <> 'stock' THEN RAISE EXCEPTION 'Stock can only be held by a stock product'; END IF;
  v_new := v.stock_units + _delta;
  IF _clamp THEN v_new := GREATEST(v_new, 0); END IF;
  IF v_new < 0 THEN RAISE EXCEPTION 'Not enough stock of %', v.name; END IF;

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
      -- Sales are costed on what was actually consumed, even if stock was clamped at zero.
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
END $$;
REVOKE ALL ON FUNCTION public.bar_stock_apply(uuid, integer, text, text, uuid, uuid, boolean, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.journal_bar_purchase() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it public.bar_items%ROWTYPE; v_units int; v_total numeric;
BEGIN
  SELECT * INTO it FROM public.bar_items WHERE id = NEW.bar_item_id;
  IF NOT FOUND OR it.club_id <> NEW.club_id THEN RAISE EXCEPTION 'Item does not belong to this club'; END IF;
  IF it.item_kind <> 'stock' THEN RAISE EXCEPTION 'Record purchases against the stock product, not a selling option or special'; END IF;
  v_units := COALESCE(NEW.quantity_units, NEW.quantity * it.unit_yield);
  v_total := COALESCE(NULLIF(NEW.total_cost, 0), NEW.unit_cost * NEW.quantity);
  PERFORM public.bar_stock_apply(it.id, v_units, 'purchase', 'bar_stock_purchases', NEW.id, NULL, true,
    CASE WHEN v_units > 0 AND v_total IS NOT NULL AND v_total > 0 THEN v_total / v_units END);
  RETURN NEW;
END $$;

-- Explicit, audited average-cost correction (no quantity change). Cost is per purchase unit (bottle / litre / unit).
CREATE OR REPLACE FUNCTION public.bar_set_average_cost(_item uuid, _cost_per_purchase_unit numeric, _note text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.bar_items%ROWTYPE; v_after numeric;
BEGIN
  SELECT * INTO v FROM public.bar_items WHERE id = _item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), v.club_id, 'bar') THEN
    RAISE EXCEPTION 'You do not have bar permission for this club'; END IF;
  IF v.item_kind <> 'stock' THEN RAISE EXCEPTION 'Set cost on the stock product'; END IF;
  IF NOT public.bar_costing_enabled(v.club_id) THEN RAISE EXCEPTION 'Stock costing is not switched on for this club'; END IF;
  IF _cost_per_purchase_unit IS NULL OR _cost_per_purchase_unit < 0 THEN RAISE EXCEPTION 'Cost must be zero or more'; END IF;
  IF COALESCE(btrim(_note), '') = '' THEN RAISE EXCEPTION 'A reason is required for a cost adjustment'; END IF;
  v_after := _cost_per_purchase_unit / GREATEST(v.unit_yield, 1);
  PERFORM set_config('sh.bar_cost_apply', '1', true);
  UPDATE public.bar_items SET avg_unit_cost = v_after, updated_at = now() WHERE id = _item;
  PERFORM set_config('sh.bar_cost_apply', '', true);
  INSERT INTO public.bar_stock_movements (club_id, bar_item_id, units_delta, requested_delta, units_after, reason,
     created_by, unit_cost, cost_value, avg_cost_before, avg_cost_after, note)
  VALUES (v.club_id, _item, 0, 0, v.stock_units, 'cost_adjustment', auth.uid(), v_after,
     round(v.stock_units * (v_after - COALESCE(v.avg_unit_cost, 0)), 4), v.avg_unit_cost, v_after, btrim(_note));
  RETURN v_after;
END $$;
GRANT EXECUTE ON FUNCTION public.bar_set_average_cost(uuid, numeric, text) TO authenticated;

-- Cost-of-sales report from snapshotted costs.
CREATE OR REPLACE FUNCTION public.bar_cost_of_sales(_club uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(sold_item_id uuid, item_name text, category text, division text, quantity numeric,
              revenue numeric, cogs numeric, uncosted_lines int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), _club, 'bar') THEN
    RAISE EXCEPTION 'You do not have bar permission for this club'; END IF;
  RETURN QUERY
  WITH lines AS (
    SELECT m.source_table, m.source_id, m.sold_item_id,
           -sum(m.cost_value) AS cogs, bool_or(m.cost_value IS NULL) AS uncosted
      FROM public.bar_stock_movements m
     WHERE m.club_id = _club AND m.reason IN ('sale','special_sale')
       AND m.created_at >= _from AND m.created_at < _to AND m.source_id IS NOT NULL
     GROUP BY 1,2,3
  ), rev AS (
    SELECT l.*, COALESCE(t.quantity, s.quantity)::numeric AS qty, COALESCE(t.total, s.total, 0)::numeric AS amount
      FROM lines l
      LEFT JOIN public.bar_tab_entries t ON l.source_table = 'bar_tab_entries' AND t.id = l.source_id AND t.club_id = _club
      LEFT JOIN public.bar_visitor_sales s ON l.source_table = 'bar_visitor_sales' AND s.id = l.source_id AND s.club_id = _club
  )
  SELECT r.sold_item_id, i.name, i.category, i.division, sum(r.qty), sum(r.amount),
         sum(COALESCE(r.cogs, 0)), count(*) FILTER (WHERE r.uncosted)::int
    FROM rev r JOIN public.bar_items i ON i.id = r.sold_item_id AND i.club_id = _club
   GROUP BY 1,2,3,4 ORDER BY 6 DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.bar_cost_of_sales(uuid, timestamptz, timestamptz) TO authenticated;