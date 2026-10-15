CREATE OR REPLACE FUNCTION public.sync_champ_match_from_linked_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _id uuid := coalesce(NEW.id, OLD.id);
BEGIN
  -- Only matches explicitly linked by booking_id; decided matches/pairings/results untouched.
  PERFORM set_config('app.self_schedule', '1', true);
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM 'active' AND OLD.status = 'active') THEN
    UPDATE public.club_champs_matches
       SET booking_id = NULL, scheduled_date = NULL, scheduled_time = NULL, court_id = NULL, updated_at = now()
     WHERE booking_id = _id AND coalesce(is_bye,false) = false
       AND coalesce(status,'') NOT IN ('completed','forfeited','walkover','cancelled');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'active' THEN
    UPDATE public.club_champs_matches
       SET scheduled_date = NEW.date, scheduled_time = NEW.start_time, court_id = NEW.court_id, updated_at = now()
     WHERE booking_id = _id AND coalesce(is_bye,false) = false
       AND coalesce(status,'') NOT IN ('completed','forfeited','walkover','cancelled')
       AND (scheduled_date IS DISTINCT FROM NEW.date OR scheduled_time IS DISTINCT FROM NEW.start_time OR court_id IS DISTINCT FROM NEW.court_id);
  END IF;
  PERFORM set_config('app.self_schedule', '', true);
  RETURN coalesce(NEW, OLD);
END $$;

CREATE TRIGGER trg_sync_champ_match_from_booking_upd
AFTER UPDATE OF status, date, start_time, court_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_champ_match_from_linked_booking();

CREATE TRIGGER trg_sync_champ_match_from_booking_del
AFTER DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_champ_match_from_linked_booking();