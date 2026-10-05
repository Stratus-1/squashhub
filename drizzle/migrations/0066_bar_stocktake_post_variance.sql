ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'bar_stock_loss';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'bar_stock_gain';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'bar_stock_on_hand';

ALTER TABLE public.bar_stock_takes
  ADD COLUMN IF NOT EXISTS posted_to_ledger boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variance_value numeric,
  ADD COLUMN IF NOT EXISTS journal_ref uuid;

CREATE OR REPLACE FUNCTION public.bar_stock_take_finalise(_take_id uuid, _adjust boolean DEFAULT true, _post boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_take public.bar_stock_takes%ROWTYPE; v_line record; v_adj int := 0; v_counted int; v_expected int;
        v_value numeric := 0; v_ref uuid; v_amt numeric;
BEGIN
  SELECT * INTO v_take FROM public.bar_stock_takes WHERE id = _take_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock take not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), v_take.club_id, 'bar') THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  IF v_take.status <> 'draft' THEN RAISE EXCEPTION 'This stock take has already been finalised'; END IF;
  IF _post AND NOT _adjust THEN RAISE EXCEPTION 'Differences can only be posted when stock is corrected'; END IF;

  FOR v_line IN SELECT l.* FROM public.bar_stock_take_lines l JOIN public.bar_items i ON i.id = l.bar_item_id
                 WHERE l.stock_take_id = _take_id AND l.counted_qty IS NOT NULL
                   AND i.club_id = v_take.club_id AND i.item_kind = 'stock' LOOP
    v_counted := v_line.counted_qty * v_line.unit_yield + COALESCE(v_line.counted_open_units, 0);
    v_expected := COALESCE(v_line.expected_units, v_line.expected_qty * v_line.unit_yield);
    IF v_counted <> v_expected THEN
      v_value := v_value + ((v_counted - v_expected)::numeric / GREATEST(v_line.unit_yield, 1)) * COALESCE(v_line.unit_cost, 0);
      IF _adjust THEN
        PERFORM public.bar_stock_apply(v_line.bar_item_id, v_counted - v_expected, 'stocktake',
                                       'bar_stock_takes', _take_id, NULL, true);
      END IF;
    END IF;
    v_adj := v_adj + 1;
  END LOOP;
  v_value := round(v_value, 2);

  IF _post AND v_value <> 0 THEN
    v_ref := gen_random_uuid();
    v_amt := abs(v_value);
    IF v_value < 0 THEN
      INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description) VALUES
        (v_take.club_id, v_ref, 'bar_stock_loss', v_amt, 0, 'Bar stock take loss ' || v_take.take_date),
        (v_take.club_id, v_ref, 'bar_stock_on_hand', 0, v_amt, 'Bar stock take loss ' || v_take.take_date);
    ELSE
      INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description) VALUES
        (v_take.club_id, v_ref, 'bar_stock_on_hand', v_amt, 0, 'Bar stock take profit ' || v_take.take_date),
        (v_take.club_id, v_ref, 'bar_stock_gain', 0, v_amt, 'Bar stock take profit ' || v_take.take_date);
    END IF;
  END IF;

  UPDATE public.bar_stock_takes SET status = 'finalised', finalised_by = auth.uid(), finalised_at = now(),
         adjusted = _adjust, posted_to_ledger = (v_ref IS NOT NULL), variance_value = v_value,
         journal_ref = v_ref, updated_at = now() WHERE id = _take_id;
  RETURN jsonb_build_object('stock_take_id', _take_id, 'adjusted_items', v_adj, 'variance_value', v_value, 'posted', v_ref IS NOT NULL);
END; $function$;

DROP FUNCTION IF EXISTS public.bar_stock_take_finalise(uuid, boolean);
REVOKE ALL ON FUNCTION public.bar_stock_take_finalise(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_stock_take_finalise(uuid, boolean, boolean) TO authenticated;