CREATE TABLE IF NOT EXISTS public.bar_stock_takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  take_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalised')),
  notes text,
  created_by uuid,
  finalised_by uuid,
  finalised_at timestamptz,
  adjusted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bar_stock_takes_one_draft_per_date
  ON public.bar_stock_takes(club_id, take_date) WHERE status = 'draft';

CREATE TABLE IF NOT EXISTS public.bar_stock_take_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_take_id uuid NOT NULL REFERENCES public.bar_stock_takes(id) ON DELETE CASCADE,
  bar_item_id uuid NOT NULL REFERENCES public.bar_items(id) ON DELETE CASCADE,
  expected_qty integer NOT NULL DEFAULT 0,
  counted_qty integer,
  unit_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stock_take_id, bar_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bar_stock_takes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bar_stock_take_lines TO authenticated;
GRANT ALL ON public.bar_stock_takes TO service_role;
GRANT ALL ON public.bar_stock_take_lines TO service_role;

ALTER TABLE public.bar_stock_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_stock_take_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bar staff manage stock takes" ON public.bar_stock_takes
  FOR ALL TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'))
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar'));

CREATE POLICY "Bar staff manage stock take lines" ON public.bar_stock_take_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bar_stock_takes t
                  WHERE t.id = stock_take_id
                    AND public.is_club_admin_or_permitted(auth.uid(), t.club_id, 'bar')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bar_stock_takes t
                  WHERE t.id = stock_take_id
                    AND public.is_club_admin_or_permitted(auth.uid(), t.club_id, 'bar')));

-- what each product's stock was at the end of a chosen date
CREATE OR REPLACE FUNCTION public.bar_stock_levels_on(_club_id uuid, _date date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb; v_cut timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar') THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  v_cut := (_date + 1)::timestamptz;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'bar_item_id', i.id, 'name', i.name, 'category', i.category,
           'cost_price', i.cost_price, 'price', i.price,
           'current_qty', i.stock_qty,
           'qty_on_date', i.stock_qty
             + COALESCE((SELECT sum(s.quantity) FROM public.bar_visitor_sales s
                          WHERE s.bar_item_id = i.id AND s.created_at >= v_cut), 0)
             + COALESCE((SELECT sum(e.quantity) FROM public.bar_tab_entries e
                          WHERE e.bar_item_id = i.id AND e.created_at >= v_cut), 0)
             - COALESCE((SELECT sum(p.quantity) FROM public.bar_stock_purchases p
                          WHERE p.bar_item_id = i.id AND p.created_at >= v_cut), 0)
         ) ORDER BY i.category NULLS LAST, i.name), '[]'::jsonb)
    INTO v FROM public.bar_items i WHERE i.club_id = _club_id AND i.active;
  RETURN v;
END; $function$;

-- start (or reopen) a stock take for a date, snapshotting the expected quantities
CREATE OR REPLACE FUNCTION public.bar_stock_take_start(_club_id uuid, _date date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_levels jsonb; v_row jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar') THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;

  SELECT id INTO v_id FROM public.bar_stock_takes
   WHERE club_id = _club_id AND take_date = _date AND status = 'draft';
  IF v_id IS NULL THEN
    INSERT INTO public.bar_stock_takes (club_id, take_date, created_by)
    VALUES (_club_id, _date, auth.uid()) RETURNING id INTO v_id;
  END IF;

  v_levels := public.bar_stock_levels_on(_club_id, _date);
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_levels) LOOP
    INSERT INTO public.bar_stock_take_lines (stock_take_id, bar_item_id, expected_qty, unit_cost)
    VALUES (v_id, (v_row->>'bar_item_id')::uuid, COALESCE((v_row->>'qty_on_date')::int, 0),
            COALESCE((v_row->>'cost_price')::numeric, 0))
    ON CONFLICT (stock_take_id, bar_item_id) DO UPDATE
      SET expected_qty = EXCLUDED.expected_qty, unit_cost = EXCLUDED.unit_cost, updated_at = now();
  END LOOP;

  RETURN v_id;
END; $function$;

-- save counted quantities (null clears a count)
CREATE OR REPLACE FUNCTION public.bar_stock_take_save(_take_id uuid, _lines jsonb, _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
       SET counted_qty = CASE WHEN v_row->>'counted_qty' IS NULL THEN NULL
                              ELSE GREATEST(0, (v_row->>'counted_qty')::int) END,
           updated_at = now()
     WHERE stock_take_id = _take_id AND bar_item_id = (v_row->>'bar_item_id')::uuid;
    v_n := v_n + 1;
  END LOOP;

  UPDATE public.bar_stock_takes
     SET notes = COALESCE(_notes, notes), updated_at = now()
   WHERE id = _take_id;
  RETURN jsonb_build_object('saved', v_n);
END; $function$;

-- finalise; optionally correct stock on hand to the counted figures
CREATE OR REPLACE FUNCTION public.bar_stock_take_finalise(_take_id uuid, _adjust boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_take public.bar_stock_takes%ROWTYPE; v_line record; v_adj int := 0;
BEGIN
  SELECT * INTO v_take FROM public.bar_stock_takes WHERE id = _take_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock take not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), v_take.club_id, 'bar') THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  IF v_take.status <> 'draft' THEN RAISE EXCEPTION 'This stock take has already been finalised'; END IF;

  IF _adjust THEN
    FOR v_line IN SELECT * FROM public.bar_stock_take_lines
                   WHERE stock_take_id = _take_id AND counted_qty IS NOT NULL LOOP
      UPDATE public.bar_items
         SET stock_qty = GREATEST(0, stock_qty + (v_line.counted_qty - v_line.expected_qty)),
             updated_at = now()
       WHERE id = v_line.bar_item_id AND club_id = v_take.club_id;
      v_adj := v_adj + 1;
    END LOOP;
  END IF;

  UPDATE public.bar_stock_takes
     SET status = 'finalised', finalised_by = auth.uid(), finalised_at = now(),
         adjusted = _adjust, updated_at = now()
   WHERE id = _take_id;

  RETURN jsonb_build_object('stock_take_id', _take_id, 'adjusted_items', v_adj);
END; $function$;