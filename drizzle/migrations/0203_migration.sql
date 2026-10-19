-- One central gate for automatic notifications (owner decision 19 Oct 2026):
-- * Tournament match messages are sent only via the tournament's draw-notice setting
--   (Automatic / Prompt / Off); the old per-change tournament notices are dropped.
-- * Court booking made/cancelled notices follow the club's "Confirmation when a booking
--   is made" switch, and never fire for tournament fixture bookings.
CREATE OR REPLACE FUNCTION public.gate_auto_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ext text;
  v_on boolean;
BEGIN
  IF NEW.title IN ('Tournament match scheduled', 'Tournament match unscheduled', 'Fixture line-up changed') THEN
    RETURN NULL;
  END IF;

  IF NEW.title IN ('Court booked with you', 'Booking cancelled') THEN
    IF NEW.data ? 'booking_id' THEN
      SELECT b.external_id, c.booking_confirm_enabled
        INTO v_ext, v_on
        FROM public.bookings b
        JOIN public.clubs c ON c.id = b.club_id
       WHERE b.id::text = NEW.data->>'booking_id';
      IF coalesce(v_ext, '') ~ '^(champ|sbs):' THEN
        RETURN NULL;
      END IF;
      IF v_on IS FALSE THEN
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_gate_auto_notifications ON public.notifications;
CREATE TRIGGER a_gate_auto_notifications
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.gate_auto_notifications();