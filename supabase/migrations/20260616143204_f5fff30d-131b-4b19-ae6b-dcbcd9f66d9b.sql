
-- 1) Backfill: mark unread tournament invites as read when the tournament is closed or past
UPDATE public.notifications n
SET read = true
FROM public.club_champs c
WHERE n.read = false
  AND n.type IN ('tournament_invite','tournament_partner_invite')
  AND (
    (n.data->>'champ_id') = c.id::text
    OR n.url LIKE '%/club-champs/' || c.id::text || '%'
  )
  AND (c.status IN ('completed','cancelled') OR c.end_date < current_date);

-- 2) Trigger to keep things tidy going forward (tournaments)
CREATE OR REPLACE FUNCTION public.mark_champ_invites_read_on_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed','cancelled')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.notifications
    SET read = true
    WHERE read = false
      AND type IN ('tournament_invite','tournament_partner_invite')
      AND (
        (data->>'champ_id') = NEW.id::text
        OR url LIKE '%/club-champs/' || NEW.id::text || '%'
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_champ_invites_read_on_close ON public.club_champs;
CREATE TRIGGER trg_mark_champ_invites_read_on_close
AFTER UPDATE OF status ON public.club_champs
FOR EACH ROW EXECUTE FUNCTION public.mark_champ_invites_read_on_close();

-- 3) Backfill: mark event notifications as read when the event is cancelled or already past
UPDATE public.notifications n
SET read = true
FROM public.club_events e
WHERE n.read = false
  AND n.type IN ('event','reminder','event_invite')
  AND (n.data->>'event_id') = e.id::text
  AND (e.status = 'cancelled' OR e.start_date < current_date);

-- 4) Trigger to mark event notifications as read when an event is cancelled
CREATE OR REPLACE FUNCTION public.mark_event_notifications_read_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled'
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.notifications
    SET read = true
    WHERE read = false
      AND type IN ('event','reminder','event_invite')
      AND (data->>'event_id') = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_event_notifications_read_on_cancel ON public.club_events;
CREATE TRIGGER trg_mark_event_notifications_read_on_cancel
AFTER UPDATE OF status ON public.club_events
FOR EACH ROW EXECUTE FUNCTION public.mark_event_notifications_read_on_cancel();
