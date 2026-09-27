
-- ───────── bar_items extensions ─────────
ALTER TABLE public.bar_items
  ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'stock',
  ADD COLUMN IF NOT EXISTS stock_parent_id uuid REFERENCES public.bar_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS consume_units integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_yield integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_label text,
  ADD COLUMN IF NOT EXISTS stock_unit_label text,
  ADD COLUMN IF NOT EXISTS stock_units integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sellable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_group text,
  ADD COLUMN IF NOT EXISTS variant_label text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to date,
  ADD COLUMN IF NOT EXISTS valid_days smallint[],
  ADD COLUMN IF NOT EXISTS valid_start_time time,
  ADD COLUMN IF NOT EXISTS valid_end_time time;

ALTER TABLE public.bar_items
  ADD CONSTRAINT bar_items_kind_chk CHECK (item_kind IN ('stock','option','special')),
  ADD CONSTRAINT bar_items_yield_chk CHECK (unit_yield BETWEEN 1 AND 1000),
  ADD CONSTRAINT bar_items_consume_chk CHECK (consume_units BETWEEN 1 AND 1000),
  ADD CONSTRAINT bar_items_option_parent_chk CHECK ((item_kind = 'option') = (stock_parent_id IS NOT NULL));

-- Backfill: every existing item is a stock item with yield 1.
UPDATE public.bar_items SET stock_units = GREATEST(stock_qty, 0) WHERE item_kind = 'stock';

CREATE INDEX IF NOT EXISTS bar_items_parent_idx ON public.bar_items(stock_parent_id);

ALTER TABLE public.club_bar_categories ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ───────── divisions ─────────
CREATE TABLE public.club_bar_divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, key)
);
GRANT SELECT ON public.club_bar_divisions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_bar_divisions TO authenticated;
GRANT ALL ON public.club_bar_divisions TO service_role;
ALTER TABLE public.club_bar_divisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view bar divisions" ON public.club_bar_divisions FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id) OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));
CREATE POLICY "Bar managers manage divisions" ON public.club_bar_divisions FOR ALL TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'))
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));

-- Bar managers (not only club admins) may manage categories too.
CREATE POLICY "Bar managers manage bar categories" ON public.club_bar_categories FOR ALL TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'))
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));

-- ───────── special components ─────────
CREATE TABLE public.bar_special_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  special_item_id uuid NOT NULL REFERENCES public.bar_items(id) ON DELETE CASCADE,
  component_item_id uuid NOT NULL REFERENCES public.bar_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (special_item_id, component_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bar_special_components TO authenticated;
GRANT ALL ON public.bar_special_components TO service_role;
ALTER TABLE public.bar_special_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view special components" ON public.bar_special_components FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id) OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));
CREATE POLICY "Bar managers manage special components" ON public.bar_special_components FOR ALL TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'))
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));

-- ───────── stock movements ─────────
CREATE TABLE public.bar_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  bar_item_id uuid NOT NULL REFERENCES public.bar_items(id) ON DELETE CASCADE,
  units_delta integer NOT NULL,
  requested_delta integer NOT NULL,
  units_after integer NOT NULL,
  reason text NOT NULL,
  source_table text,
  source_id uuid,
  sold_item_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bar_stock_movements_item_idx ON public.bar_stock_movements(bar_item_id, created_at);
CREATE INDEX bar_stock_movements_club_idx ON public.bar_stock_movements(club_id, created_at);
GRANT SELECT ON public.bar_stock_movements TO authenticated;
GRANT ALL ON public.bar_stock_movements TO service_role;
ALTER TABLE public.bar_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bar managers view stock movements" ON public.bar_stock_movements FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));

-- ───────── helpers ─────────
-- Units of the stock root consumed by selling ONE of an item (not for specials).
CREATE OR REPLACE FUNCTION public.bar_units_per_sale(_item public.bar_items)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _item.item_kind = 'option' THEN _item.consume_units ELSE _item.unit_yield END
$$;

CREATE OR REPLACE FUNCTION public.bar_special_available(_special uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH need AS (
    SELECT COALESCE(ci.stock_parent_id, ci.id) AS root,
           sum(c.quantity * public.bar_units_per_sale(ci)) AS units
      FROM public.bar_special_components c
      JOIN public.bar_items ci ON ci.id = c.component_item_id
     WHERE c.special_item_id = _special
     GROUP BY 1
  )
  SELECT COALESCE(min(floor(r.stock_units::numeric / NULLIF(n.units, 0)))::int, 0)
    FROM need n JOIN public.bar_items r ON r.id = n.root
$$;

CREATE OR REPLACE FUNCTION public.bar_item_valid_now(_item public.bar_items, _at timestamptz DEFAULT now())
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_local timestamp := (_at AT TIME ZONE 'Africa/Johannesburg'); v_t time := v_local::time; v_d date := v_local::date;
BEGIN
  IF _item.item_kind <> 'special' THEN RETURN true; END IF;
  IF _item.valid_from IS NOT NULL AND v_d < _item.valid_from THEN RETURN false; END IF;
  IF _item.valid_to IS NOT NULL AND v_d > _item.valid_to THEN RETURN false; END IF;
  IF _item.valid_days IS NOT NULL AND array_length(_item.valid_days, 1) > 0
     AND NOT (extract(dow FROM v_local)::smallint = ANY(_item.valid_days)) THEN RETURN false; END IF;
  IF _item.valid_start_time IS NOT NULL AND _item.valid_end_time IS NOT NULL THEN
    IF _item.valid_start_time <= _item.valid_end_time THEN
      IF v_t < _item.valid_start_time OR v_t >= _item.valid_end_time THEN RETURN false; END IF;
    ELSE -- overnight window e.g. 20:00-02:00
      IF v_t < _item.valid_start_time AND v_t >= _item.valid_end_time THEN RETURN false; END IF;
    END IF;
  ELSIF _item.valid_start_time IS NOT NULL AND v_t < _item.valid_start_time THEN RETURN false;
  ELSIF _item.valid_end_time IS NOT NULL AND v_t >= _item.valid_end_time THEN RETURN false;
  END IF;
  RETURN true;
END $$;

-- Recompute derived availability (stock_qty) of options/specials that depend on a stock root.
CREATE OR REPLACE FUNCTION public.bar_refresh_dependents(_stock_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.bar_items o
     SET stock_qty = floor(p.stock_units::numeric / GREATEST(o.consume_units, 1))::int
    FROM public.bar_items p
   WHERE o.stock_parent_id = _stock_id AND o.item_kind = 'option' AND p.id = _stock_id
     AND o.stock_qty IS DISTINCT FROM floor(p.stock_units::numeric / GREATEST(o.consume_units, 1))::int;

  UPDATE public.bar_items s
     SET stock_qty = public.bar_special_available(s.id)
   WHERE s.item_kind = 'special'
     AND s.id IN (SELECT c.special_item_id FROM public.bar_special_components c
                    JOIN public.bar_items ci ON ci.id = c.component_item_id
                   WHERE COALESCE(ci.stock_parent_id, ci.id) = _stock_id)
     AND s.stock_qty IS DISTINCT FROM public.bar_special_available(s.id);
END $$;

-- Single entry point for stock changes on a STOCK item (units = smallest unit, e.g. tots).
CREATE OR REPLACE FUNCTION public.bar_stock_apply(
  _item uuid, _delta integer, _reason text, _source_table text DEFAULT NULL,
  _source_id uuid DEFAULT NULL, _sold_item uuid DEFAULT NULL, _clamp boolean DEFAULT true)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.bar_items%ROWTYPE; v_new int;
BEGIN
  SELECT * INTO v FROM public.bar_items WHERE id = _item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock item not found'; END IF;
  IF v.item_kind <> 'stock' THEN RAISE EXCEPTION 'Stock can only be held by a stock product'; END IF;
  v_new := v.stock_units + _delta;
  IF _clamp THEN v_new := GREATEST(v_new, 0); END IF;
  IF v_new < 0 THEN RAISE EXCEPTION 'Not enough stock of %', v.name; END IF;
  PERFORM set_config('sh.bar_stock_apply', '1', true);
  UPDATE public.bar_items SET stock_units = v_new, updated_at = now() WHERE id = _item;
  PERFORM set_config('sh.bar_stock_apply', '', true);
  INSERT INTO public.bar_stock_movements (club_id, bar_item_id, units_delta, requested_delta, units_after,
                                          reason, source_table, source_id, sold_item_id, created_by)
  VALUES (v.club_id, _item, v_new - v.stock_units, _delta, v_new, _reason, _source_table, _source_id, _sold_item, auth.uid());
  RETURN v_new;
END $$;

-- Keep stock_qty (whole units, used by existing screens) in sync with stock_units; guard tenancy.
CREATE OR REPLACE FUNCTION public.bar_items_sync_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_parent public.bar_items%ROWTYPE;
BEGIN
  IF NEW.stock_parent_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.bar_items WHERE id = NEW.stock_parent_id;
    IF NOT FOUND OR v_parent.club_id <> NEW.club_id THEN RAISE EXCEPTION 'Parent stock product must belong to the same club'; END IF;
    IF v_parent.item_kind <> 'stock' THEN RAISE EXCEPTION 'A selling option must point at a stock product'; END IF;
  END IF;
  IF NEW.archived_at IS NOT NULL THEN NEW.active := false; END IF;

  IF NEW.item_kind <> 'stock' THEN
    NEW.stock_units := 0;
    IF TG_OP = 'INSERT' THEN NEW.stock_qty := 0; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.stock_units = 0 AND NEW.stock_qty > 0 THEN NEW.stock_units := NEW.stock_qty * NEW.unit_yield; END IF;
  ELSIF NEW.unit_yield <> OLD.unit_yield AND NEW.stock_units = OLD.stock_units THEN
    -- Same physical bottles, new yield: rescale tots.
    NEW.stock_units := round(OLD.stock_units::numeric * NEW.unit_yield / OLD.unit_yield)::int;
  ELSIF NEW.stock_units = OLD.stock_units AND NEW.stock_qty IS DISTINCT FROM OLD.stock_qty THEN
    -- Legacy edit of whole units: keep any open-unit remainder.
    NEW.stock_units := GREATEST(NEW.stock_qty, 0) * NEW.unit_yield + (OLD.stock_units % OLD.unit_yield);
  END IF;
  NEW.stock_units := GREATEST(NEW.stock_units, 0);
  NEW.stock_qty := floor(NEW.stock_units::numeric / NEW.unit_yield)::int;
  RETURN NEW;
END $$;

CREATE TRIGGER a_bar_items_sync_stock BEFORE INSERT OR UPDATE ON public.bar_items
  FOR EACH ROW EXECUTE FUNCTION public.bar_items_sync_stock();

CREATE OR REPLACE FUNCTION public.bar_items_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.item_kind = 'stock' THEN
    IF COALESCE(current_setting('sh.bar_stock_apply', true), '') <> '1'
       AND ((TG_OP = 'INSERT' AND NEW.stock_units <> 0) OR (TG_OP = 'UPDATE' AND NEW.stock_units <> OLD.stock_units)) THEN
      INSERT INTO public.bar_stock_movements (club_id, bar_item_id, units_delta, requested_delta, units_after, reason, created_by)
      VALUES (NEW.club_id, NEW.id,
              NEW.stock_units - CASE WHEN TG_OP = 'INSERT' THEN 0 ELSE OLD.stock_units END,
              NEW.stock_units - CASE WHEN TG_OP = 'INSERT' THEN 0 ELSE OLD.stock_units END,
              NEW.stock_units, CASE WHEN TG_OP = 'INSERT' THEN 'opening' ELSE 'manual_edit' END, auth.uid());
    END IF;
    IF TG_OP = 'INSERT' OR NEW.stock_units <> OLD.stock_units OR NEW.unit_yield <> OLD.unit_yield THEN
      PERFORM public.bar_refresh_dependents(NEW.id);
    END IF;
  ELSIF NEW.item_kind = 'option' AND (TG_OP = 'INSERT' OR NEW.consume_units <> OLD.consume_units
        OR NEW.stock_parent_id IS DISTINCT FROM OLD.stock_parent_id) THEN
    PERFORM public.bar_refresh_dependents(NEW.stock_parent_id);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER z_bar_items_after_change AFTER INSERT OR UPDATE ON public.bar_items
  FOR EACH ROW EXECUTE FUNCTION public.bar_items_after_change();

-- Special component guard + availability refresh.
CREATE OR REPLACE FUNCTION public.bar_special_components_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.bar_items%ROWTYPE; c public.bar_items%ROWTYPE; v_sid uuid;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT * INTO s FROM public.bar_items WHERE id = NEW.special_item_id;
    SELECT * INTO c FROM public.bar_items WHERE id = NEW.component_item_id;
    IF s.id IS NULL OR c.id IS NULL THEN RAISE EXCEPTION 'Unknown item'; END IF;
    IF s.club_id <> NEW.club_id OR c.club_id <> NEW.club_id THEN RAISE EXCEPTION 'Special and components must belong to the same club'; END IF;
    IF s.item_kind <> 'special' THEN RAISE EXCEPTION 'Components can only be added to a special'; END IF;
    IF c.item_kind = 'special' THEN RAISE EXCEPTION 'A special cannot contain another special'; END IF;
    v_sid := NEW.special_item_id;
  ELSE
    v_sid := OLD.special_item_id;
  END IF;
  UPDATE public.bar_items SET stock_qty = public.bar_special_available(v_sid) WHERE id = v_sid;
  RETURN NULL;
END $$;
CREATE TRIGGER bar_special_components_guard_trg AFTER INSERT OR UPDATE OR DELETE ON public.bar_special_components
  FOR EACH ROW EXECUTE FUNCTION public.bar_special_components_guard();

-- ───────── sales consume stock ─────────
CREATE OR REPLACE FUNCTION public.bar_consume_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it public.bar_items%ROWTYPE; r record;
BEGIN
  SELECT * INTO it FROM public.bar_items WHERE id = NEW.bar_item_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF it.item_kind = 'special' THEN
    IF NOT public.bar_item_valid_now(it) THEN RAISE EXCEPTION '% is not available right now', it.name; END IF;
    -- Lock roots and check every component first (atomic: all or nothing).
    FOR r IN
      SELECT COALESCE(ci.stock_parent_id, ci.id) AS root,
             sum(c.quantity * public.bar_units_per_sale(ci)) * NEW.quantity AS units
        FROM public.bar_special_components c JOIN public.bar_items ci ON ci.id = c.component_item_id
       WHERE c.special_item_id = it.id GROUP BY 1
    LOOP
      PERFORM 1 FROM public.bar_items WHERE id = r.root AND stock_units >= r.units FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Not enough stock for %', it.name; END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.bar_special_components WHERE special_item_id = it.id) THEN
      RAISE EXCEPTION '% has no components set up', it.name;
    END IF;
    FOR r IN
      SELECT COALESCE(ci.stock_parent_id, ci.id) AS root,
             sum(c.quantity * public.bar_units_per_sale(ci)) * NEW.quantity AS units
        FROM public.bar_special_components c JOIN public.bar_items ci ON ci.id = c.component_item_id
       WHERE c.special_item_id = it.id GROUP BY 1
    LOOP
      PERFORM public.bar_stock_apply(r.root, -r.units::int, 'special_sale', TG_TABLE_NAME, NEW.id, it.id, false);
    END LOOP;
  ELSE
    -- Existing policy for ordinary items: the sale goes through; stock never drops below zero.
    PERFORM public.bar_stock_apply(COALESCE(it.stock_parent_id, it.id),
                                   -(NEW.quantity * public.bar_units_per_sale(it)),
                                   'sale', TG_TABLE_NAME, NEW.id, it.id, true);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_decrement_bar_stock ON public.bar_tab_entries;
DROP TRIGGER IF EXISTS trg_decrement_bar_stock_visitor ON public.bar_visitor_sales;
CREATE TRIGGER trg_decrement_bar_stock AFTER INSERT ON public.bar_tab_entries
  FOR EACH ROW EXECUTE FUNCTION public.bar_consume_sale();
CREATE TRIGGER trg_decrement_bar_stock_visitor AFTER INSERT ON public.bar_visitor_sales
  FOR EACH ROW EXECUTE FUNCTION public.bar_consume_sale();

-- Purchases add stock (quantity is in whole units, e.g. bottles).
CREATE OR REPLACE FUNCTION public.journal_bar_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it public.bar_items%ROWTYPE;
BEGIN
  SELECT * INTO it FROM public.bar_items WHERE id = NEW.bar_item_id;
  IF NOT FOUND OR it.club_id <> NEW.club_id THEN RAISE EXCEPTION 'Item does not belong to this club'; END IF;
  IF it.item_kind <> 'stock' THEN RAISE EXCEPTION 'Record purchases against the stock product, not a selling option or special'; END IF;
  PERFORM public.bar_stock_apply(it.id, NEW.quantity * it.unit_yield, 'purchase', 'bar_stock_purchases', NEW.id, NULL, true);
  RETURN NEW;
END $$;

-- ───────── stock takes: full units + open-unit remainder ─────────
ALTER TABLE public.bar_stock_take_lines
  ADD COLUMN IF NOT EXISTS expected_units integer,
  ADD COLUMN IF NOT EXISTS counted_open_units integer,
  ADD COLUMN IF NOT EXISTS unit_yield integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bar_stock_levels_on(_club_id uuid, _date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE v jsonb; v_cut timestamptz; v_t0 timestamptz := '2026-09-27T15:20:00Z';
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar') THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  v_cut := (_date + 1)::timestamptz;

  WITH lv AS (
    SELECT i.*,
      i.stock_units
        - COALESCE((SELECT sum(m.units_delta) FROM public.bar_stock_movements m
                     WHERE m.bar_item_id = i.id AND m.created_at >= GREATEST(v_cut, v_t0)), 0)
        + CASE WHEN v_cut < v_t0 THEN
              COALESCE((SELECT sum(s.quantity) FROM public.bar_visitor_sales s
                         WHERE s.bar_item_id = i.id AND s.created_at >= v_cut AND s.created_at < v_t0), 0)
            + COALESCE((SELECT sum(e.quantity) FROM public.bar_tab_entries e
                         WHERE e.bar_item_id = i.id AND e.created_at >= v_cut AND e.created_at < v_t0), 0)
            - COALESCE((SELECT sum(p.quantity) FROM public.bar_stock_purchases p
                         WHERE p.bar_item_id = i.id AND p.created_at >= v_cut AND p.created_at < v_t0), 0)
          ELSE 0 END AS units_on_date
    FROM public.bar_items i
    WHERE i.club_id = _club_id AND i.active AND i.item_kind = 'stock' AND i.archived_at IS NULL
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bar_item_id', id, 'name', name, 'category', category,
           'cost_price', cost_price, 'price', price, 'unit_yield', unit_yield,
           'unit_label', unit_label, 'stock_unit_label', stock_unit_label,
           'current_units', stock_units, 'current_qty', stock_qty,
           'units_on_date', GREATEST(units_on_date, 0),
           'qty_on_date', floor(GREATEST(units_on_date, 0)::numeric / unit_yield)::int,
           'open_units_on_date', GREATEST(units_on_date, 0) % unit_yield
         ) ORDER BY category NULLS LAST, name), '[]'::jsonb)
    INTO v FROM lv;
  RETURN v;
END; $function$;

CREATE OR REPLACE FUNCTION public.bar_stock_take_start(_club_id uuid, _date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_id uuid; v_levels jsonb; v_row jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar') THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  SELECT id INTO v_id FROM public.bar_stock_takes WHERE club_id = _club_id AND take_date = _date AND status = 'draft';
  IF v_id IS NULL THEN
    INSERT INTO public.bar_stock_takes (club_id, take_date, created_by) VALUES (_club_id, _date, auth.uid()) RETURNING id INTO v_id;
  END IF;
  v_levels := public.bar_stock_levels_on(_club_id, _date);
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_levels) LOOP
    INSERT INTO public.bar_stock_take_lines (stock_take_id, bar_item_id, expected_qty, expected_units, unit_yield, unit_cost)
    VALUES (v_id, (v_row->>'bar_item_id')::uuid, COALESCE((v_row->>'qty_on_date')::int, 0),
            COALESCE((v_row->>'units_on_date')::int, 0), COALESCE((v_row->>'unit_yield')::int, 1),
            COALESCE((v_row->>'cost_price')::numeric, 0))
    ON CONFLICT (stock_take_id, bar_item_id) DO UPDATE
      SET expected_qty = EXCLUDED.expected_qty, expected_units = EXCLUDED.expected_units,
          unit_yield = EXCLUDED.unit_yield, unit_cost = EXCLUDED.unit_cost, updated_at = now();
  END LOOP;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.bar_stock_take_save(_take_id uuid, _lines jsonb, _notes text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_take public.bar_stock_takes%ROWTYPE; v_row jsonb; v_n int := 0;
BEGIN
  SELECT * INTO v_take FROM public.bar_stock_takes WHERE id = _take_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock take not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), v_take.club_id, 'bar') THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  IF v_take.status <> 'draft' THEN RAISE EXCEPTION 'This stock take has already been finalised'; END IF;
  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    UPDATE public.bar_stock_take_lines
       SET counted_qty = CASE WHEN v_row->>'counted_qty' IS NULL THEN NULL ELSE GREATEST(0, (v_row->>'counted_qty')::int) END,
           counted_open_units = CASE WHEN v_row->>'counted_open_units' IS NULL THEN NULL
                                     ELSE LEAST(GREATEST(0, (v_row->>'counted_open_units')::int), GREATEST(unit_yield - 1, 0)) END,
           updated_at = now()
     WHERE stock_take_id = _take_id AND bar_item_id = (v_row->>'bar_item_id')::uuid;
    v_n := v_n + 1;
  END LOOP;
  UPDATE public.bar_stock_takes SET notes = COALESCE(_notes, notes), updated_at = now() WHERE id = _take_id;
  RETURN jsonb_build_object('saved', v_n);
END; $function$;

CREATE OR REPLACE FUNCTION public.bar_stock_take_finalise(_take_id uuid, _adjust boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_take public.bar_stock_takes%ROWTYPE; v_line record; v_adj int := 0; v_counted int; v_expected int;
BEGIN
  SELECT * INTO v_take FROM public.bar_stock_takes WHERE id = _take_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock take not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), v_take.club_id, 'bar') THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  IF v_take.status <> 'draft' THEN RAISE EXCEPTION 'This stock take has already been finalised'; END IF;
  IF _adjust THEN
    FOR v_line IN SELECT l.* FROM public.bar_stock_take_lines l JOIN public.bar_items i ON i.id = l.bar_item_id
                   WHERE l.stock_take_id = _take_id AND l.counted_qty IS NOT NULL
                     AND i.club_id = v_take.club_id AND i.item_kind = 'stock' LOOP
      v_counted := v_line.counted_qty * v_line.unit_yield + COALESCE(v_line.counted_open_units, 0);
      v_expected := COALESCE(v_line.expected_units, v_line.expected_qty * v_line.unit_yield);
      IF v_counted <> v_expected THEN
        PERFORM public.bar_stock_apply(v_line.bar_item_id, v_counted - v_expected, 'stocktake',
                                       'bar_stock_takes', _take_id, NULL, true);
      END IF;
      v_adj := v_adj + 1;
    END LOOP;
  END IF;
  UPDATE public.bar_stock_takes SET status = 'finalised', finalised_by = auth.uid(), finalised_at = now(),
         adjusted = _adjust, updated_at = now() WHERE id = _take_id;
  RETURN jsonb_build_object('stock_take_id', _take_id, 'adjusted_items', v_adj);
END; $function$;

-- ───────── POS menus: only currently sellable items ─────────
CREATE OR REPLACE FUNCTION public.bar_item_on_menu(_item public.bar_items)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT _item.active AND _item.sellable AND _item.archived_at IS NULL AND public.bar_item_valid_now(_item)
$$;

CREATE OR REPLACE FUNCTION public.resolve_qr_short_code(_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_rec public.qr_short_codes%ROWTYPE; v_club record; v_item jsonb; v_menu jsonb;
BEGIN
  SELECT * INTO v_rec FROM public.qr_short_codes WHERE code = _code AND active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT id, name, logo_url, subdomain, currency_code, honesty_bar_enabled,
         bar_account_tab_enabled, bar_pay_online_enabled, bar_card_swipe_enabled, payment_gateway
    INTO v_club FROM public.clubs WHERE id = v_rec.club_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;

  IF v_rec.bar_item_id IS NOT NULL THEN
    SELECT jsonb_build_object('id', b.id, 'name', b.name, 'price', b.price, 'category', b.category,
      'division', b.division, 'image_url', b.image_url, 'stock_qty', b.stock_qty,
      'active', public.bar_item_on_menu(b), 'barcode', b.barcode, 'item_kind', b.item_kind)
      INTO v_item FROM public.bar_items b WHERE b.id = v_rec.bar_item_id;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'price', b.price,
      'category', b.category, 'division', b.division, 'image_url', b.image_url,
      'stock_qty', b.stock_qty, 'barcode', b.barcode, 'item_kind', b.item_kind,
      'stock_parent_id', b.stock_parent_id, 'product_group', b.product_group, 'variant_label', b.variant_label)
      ORDER BY (b.item_kind = 'special') DESC, b.sort_order NULLS LAST, b.name), '[]'::jsonb)
      INTO v_menu FROM public.bar_items b
     WHERE b.club_id = v_rec.club_id AND public.bar_item_on_menu(b) AND COALESCE(b.stock_qty, 0) > 0;
  END IF;

  RETURN jsonb_build_object('found', true, 'kind', v_rec.kind, 'code', v_rec.code,
    'club', jsonb_build_object('id', v_club.id, 'name', v_club.name, 'logo_url', v_club.logo_url,
      'subdomain', v_club.subdomain, 'currency_code', v_club.currency_code,
      'bar_enabled', COALESCE(v_club.honesty_bar_enabled, false),
      'account_tab_enabled', COALESCE(v_club.bar_account_tab_enabled, true),
      'pay_online_enabled', COALESCE(v_club.bar_pay_online_enabled, true)
        AND lower(COALESCE(v_club.payment_gateway, '')) IN ('stitch','yoco'),
      'card_swipe_enabled', COALESCE(v_club.bar_card_swipe_enabled, true)),
    'item', v_item, 'menu', v_menu);
END; $function$;

CREATE OR REPLACE FUNCTION public.bar_counter_board(_token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_club uuid; v_items jsonb; v_tabs jsonb; v_c public.clubs%ROWTYPE;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  SELECT * INTO v_c FROM public.clubs WHERE id = v_club;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'price', i.price, 'category', i.category,
           'barcode', i.barcode, 'image_url', i.image_url, 'division', i.division, 'item_kind', i.item_kind,
           'stock_qty', i.stock_qty)
         ORDER BY (i.item_kind = 'special') DESC, i.category NULLS LAST, i.name), '[]'::jsonb)
    INTO v_items FROM public.bar_items i
   WHERE i.club_id = v_club AND public.bar_item_on_menu(i)
     AND (i.item_kind <> 'special' OR i.stock_qty > 0);

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'opened_at'), '[]'::jsonb) INTO v_tabs
  FROM (
    SELECT jsonb_build_object(
             'tab_id', g.id, 'token', g.token, 'guest_name', g.guest_name,
             'status', g.status, 'opened_at', g.opened_at,
             'total', COALESCE((SELECT sum(s.total) FROM public.bar_visitor_sales s WHERE s.guest_tab_id = g.id), 0),
             'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', b.name, 'quantity', s.quantity, 'total', s.total)
                                                 ORDER BY s.created_at)
                                  FROM public.bar_visitor_sales s
                                  LEFT JOIN public.bar_items b ON b.id = s.bar_item_id
                                 WHERE s.guest_tab_id = g.id), '[]'::jsonb)
           ) AS t
      FROM public.bar_guest_tabs g
     WHERE g.club_id = v_club AND g.status IN ('open','closing')
  ) q;

  RETURN jsonb_build_object('club_id', v_club, 'club_name', v_c.name,
    'cash_enabled', COALESCE(v_c.bar_cash_enabled, false),
    'card_enabled', COALESCE(v_c.bar_card_swipe_enabled, true),
    'items', v_items, 'tabs', v_tabs);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.bar_stock_apply(uuid, integer, text, text, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bar_refresh_dependents(uuid) FROM PUBLIC, anon, authenticated;
