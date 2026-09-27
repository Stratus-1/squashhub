CREATE OR REPLACE FUNCTION public.bar_item_valid_now(_item public.bar_items, _at timestamptz DEFAULT now())
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_local timestamp := (_at AT TIME ZONE 'Africa/Johannesburg'); v_t time := v_local::time; v_d date := v_local::date;
BEGIN
  IF _item.item_kind <> 'special' THEN RETURN true; END IF;
  IF _item.valid_from IS NOT NULL AND v_d < _item.valid_from THEN RETURN false; END IF;
  IF _item.valid_to IS NOT NULL AND v_d > _item.valid_to THEN RETURN false; END IF;
  IF _item.valid_days IS NOT NULL AND array_length(_item.valid_days, 1) > 0
     AND NOT (extract(dow FROM v_local)::smallint = ANY(_item.valid_days)) THEN RETURN false; END IF;
  IF _item.valid_start_time IS NOT NULL AND _item.valid_end_time IS NOT NULL
     AND _item.valid_start_time <> _item.valid_end_time THEN -- equal start/end = all day
    IF _item.valid_start_time <= _item.valid_end_time THEN
      IF v_t < _item.valid_start_time OR v_t >= _item.valid_end_time THEN RETURN false; END IF;
    ELSE -- overnight window e.g. 20:00-02:00
      IF v_t < _item.valid_start_time AND v_t >= _item.valid_end_time THEN RETURN false; END IF;
    END IF;
  ELSIF _item.valid_end_time IS NULL AND _item.valid_start_time IS NOT NULL AND v_t < _item.valid_start_time THEN RETURN false;
  ELSIF _item.valid_start_time IS NULL AND _item.valid_end_time IS NOT NULL AND v_t >= _item.valid_end_time THEN RETURN false;
  END IF;
  RETURN true;
END $$;