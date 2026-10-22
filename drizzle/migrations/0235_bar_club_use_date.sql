CREATE OR REPLACE FUNCTION public.bar_club_use(_item uuid, _qty numeric, _reason text, _date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb; v_ts timestamptz;
BEGIN
  IF _date IS NOT NULL AND _date > (now() AT TIME ZONE 'Africa/Johannesburg')::date THEN
    RAISE EXCEPTION 'The date cannot be in the future';
  END IF;
  r := public.bar_club_use(_item, _qty, _reason);
  IF _date IS NOT NULL AND _date <> (now() AT TIME ZONE 'Africa/Johannesburg')::date THEN
    v_ts := (_date::timestamp + time '12:00') AT TIME ZONE 'Africa/Johannesburg';
    UPDATE public.bar_stock_movements SET created_at = v_ts WHERE id = (r->>'movement_id')::uuid;
    IF r->>'journal_ref' IS NOT NULL THEN
      UPDATE public.club_journal_entries SET created_at = v_ts WHERE journal_ref = (r->>'journal_ref')::uuid;
    END IF;
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.bar_club_use(uuid, numeric, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_club_use(uuid, numeric, text, date) TO authenticated;