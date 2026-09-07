CREATE OR REPLACE FUNCTION public.prevent_overlapping_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict record;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  SELECT b.id, b.start_time, b.end_time, b.guest_name
    INTO v_conflict
  FROM public.bookings b
  WHERE b.court_id = NEW.court_id
    AND b.date = NEW.date
    AND b.status = 'active'
    AND b.id IS DISTINCT FROM NEW.id
    AND b.start_time < NEW.end_time
    AND b.end_time > NEW.start_time
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'This court is already booked on % from % to %',
      NEW.date, to_char(v_conflict.start_time, 'HH24:MI'), to_char(v_conflict.end_time, 'HH24:MI')
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_overlapping_bookings ON public.bookings;
CREATE TRIGGER trg_prevent_overlapping_bookings
BEFORE INSERT OR UPDATE OF court_id, date, start_time, end_time, status
ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.prevent_overlapping_bookings();