-- "Score offline" (device scoring) must stay visible to spectators: while a
-- match is reserved for offline scoring the fixture list and live page show
-- "LIVE · offline" instead of dropping to "Paused" after the 60s heartbeat
-- window (the offline phone cannot send heartbeats while it has no internet).
-- The lock row mirrors the device reservation and is removed when the
-- reservation is released or revoked.

ALTER TABLE public.champ_marker_locks
  ADD COLUMN IF NOT EXISTS scoring_mode text NOT NULL DEFAULT 'live'
  CHECK (scoring_mode IN ('live', 'offline'));

-- Keep the marker lock in step with the device reservation.
CREATE OR REPLACE FUNCTION public.champ_device_reservation_lock_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.revoked_at IS NOT NULL THEN
    DELETE FROM public.champ_marker_locks
     WHERE match_id = NEW.match_id AND scoring_mode = 'offline';
    RETURN NEW;
  END IF;

  IF NEW.owner_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.champ_marker_locks
    (match_id, user_id, user_name, heartbeat_at, scoring_mode)
  VALUES
    (NEW.match_id, NEW.owner_user_id,
     COALESCE(NULLIF(NEW.owner_label, ''), 'A marker'), now(), 'offline')
  ON CONFLICT (match_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        user_name = EXCLUDED.user_name,
        scoring_mode = 'offline',
        heartbeat_at = now(),
        takeover_requested_by = NULL,
        takeover_requested_name = NULL,
        takeover_requested_at = NULL,
        takeover_declined_at = NULL;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_champ_device_reservation_lock ON public.champ_device_reservations;
CREATE TRIGGER trg_champ_device_reservation_lock
AFTER INSERT OR UPDATE OR DELETE ON public.champ_device_reservations
FOR EACH ROW EXECUTE FUNCTION public.champ_device_reservation_lock_sync();
