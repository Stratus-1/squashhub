-- Fix: the DELETE branch of the reservation lock trigger returned early
-- (NEW is NULL for DELETE), leaving the offline marker lock behind.

CREATE OR REPLACE FUNCTION public.champ_device_reservation_lock_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.champ_marker_locks
     WHERE match_id = OLD.match_id AND scoring_mode = 'offline';
    RETURN OLD;
  END IF;

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
