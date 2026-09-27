CREATE OR REPLACE FUNCTION public.sync_league_name_to_bookings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name AND OLD.name IS NOT NULL AND NEW.club_id IS NOT NULL THEN
    UPDATE public.bookings
       SET guest_name = regexp_replace(guest_name, '(^|- | vs )' || regexp_replace(OLD.name, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '( vs |$)', '\1' || NEW.name || '\2', 'g')
     WHERE club_id = NEW.club_id AND booking_type = 'league' AND guest_name LIKE '%' || OLD.name || '%';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_league_name_to_bookings ON public.leagues;
CREATE TRIGGER trg_sync_league_name_to_bookings AFTER UPDATE OF name ON public.leagues
FOR EACH ROW EXECUTE FUNCTION public.sync_league_name_to_bookings();