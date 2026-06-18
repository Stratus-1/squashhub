
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS shelly_schedule_on_id text,
  ADD COLUMN IF NOT EXISTS shelly_schedule_off_id text;

INSERT INTO public.app_settings (key, value)
VALUES ('lights_function_base_url', 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION public.notify_court_lights_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_url    text;
  v_action text;
  v_body   jsonb;
BEGIN
  SELECT value INTO v_secret FROM public.app_settings WHERE key = 'lights_private_internal_secret';
  SELECT value INTO v_url    FROM public.app_settings WHERE key = 'lights_function_base_url';

  IF v_secret IS NULL OR v_url IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_body := jsonb_build_object(
      'action', v_action,
      'booking_id', OLD.id,
      'court_id', OLD.court_id,
      'club_id', OLD.club_id,
      'schedule_on_id', OLD.shelly_schedule_on_id,
      'schedule_off_id', OLD.shelly_schedule_off_id
    );
  ELSE
    v_action := CASE WHEN NEW.status = 'active' THEN 'sync' ELSE 'delete' END;
    v_body := jsonb_build_object(
      'action', v_action,
      'booking_id', NEW.id,
      'court_id', NEW.court_id,
      'club_id', NEW.club_id,
      'schedule_on_id', COALESCE(NEW.shelly_schedule_on_id, CASE WHEN TG_OP='UPDATE' THEN OLD.shelly_schedule_on_id END),
      'schedule_off_id', COALESCE(NEW.shelly_schedule_off_id, CASE WHEN TG_OP='UPDATE' THEN OLD.shelly_schedule_off_id END)
    );
  END IF;

  PERFORM net.http_post(
    url := v_url || '/court-lights-schedule',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_secret
    ),
    body := v_body
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_shelly_schedule_ins ON public.bookings;
CREATE TRIGGER trg_bookings_shelly_schedule_ins
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_court_lights_schedule();

DROP TRIGGER IF EXISTS trg_bookings_shelly_schedule_del ON public.bookings;
CREATE TRIGGER trg_bookings_shelly_schedule_del
AFTER DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_court_lights_schedule();

DROP TRIGGER IF EXISTS trg_bookings_shelly_schedule_upd ON public.bookings;
CREATE TRIGGER trg_bookings_shelly_schedule_upd
AFTER UPDATE ON public.bookings
FOR EACH ROW
WHEN (
  OLD.date IS DISTINCT FROM NEW.date
  OR OLD.start_time IS DISTINCT FROM NEW.start_time
  OR OLD.end_time IS DISTINCT FROM NEW.end_time
  OR OLD.court_id IS DISTINCT FROM NEW.court_id
  OR OLD.status   IS DISTINCT FROM NEW.status
)
EXECUTE FUNCTION public.notify_court_lights_schedule();

-- Backfill: push schedules for every active future booking
DO $$
DECLARE
  v_secret text;
  v_url    text;
  r record;
BEGIN
  SELECT value INTO v_secret FROM public.app_settings WHERE key = 'lights_private_internal_secret';
  SELECT value INTO v_url    FROM public.app_settings WHERE key = 'lights_function_base_url';
  IF v_secret IS NULL OR v_url IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT id, court_id, club_id
    FROM public.bookings
    WHERE status = 'active' AND date >= CURRENT_DATE
  LOOP
    PERFORM net.http_post(
      url := v_url || '/court-lights-schedule',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', v_secret
      ),
      body := jsonb_build_object(
        'action', 'sync',
        'booking_id', r.id,
        'court_id', r.court_id,
        'club_id', r.club_id
      )
    );
  END LOOP;
END $$;
