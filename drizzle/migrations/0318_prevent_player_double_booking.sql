CREATE OR REPLACE FUNCTION public.guard_player_double_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _clash record; _ids uuid[];
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' OR COALESCE(NEW.source,'squashhub') <> 'squashhub' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.date = OLD.date AND NEW.start_time = OLD.start_time AND NEW.end_time = OLD.end_time
     AND NEW.club_member_id IS NOT DISTINCT FROM OLD.club_member_id
     AND NEW.opponent_member_id IS NOT DISTINCT FROM OLD.opponent_member_id
     AND OLD.status = 'active' THEN RETURN NEW; END IF;
  _ids := array_remove(ARRAY[NEW.club_member_id, NEW.opponent_member_id], NULL);
  IF array_length(_ids,1) IS NULL THEN RETURN NEW; END IF;
  SELECT b.id, cm.name INTO _clash
  FROM bookings b
  JOIN club_members cm ON cm.id = ANY(_ids) AND cm.id IN (b.club_member_id, b.opponent_member_id)
  WHERE b.id <> NEW.id AND b.status = 'active' AND b.date = NEW.date
    AND b.start_time < NEW.end_time AND b.end_time > NEW.start_time
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '% is already booked on another court at this time.', _clash.name USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_player_double_booking ON public.bookings;
CREATE TRIGGER trg_guard_player_double_booking BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_player_double_booking();