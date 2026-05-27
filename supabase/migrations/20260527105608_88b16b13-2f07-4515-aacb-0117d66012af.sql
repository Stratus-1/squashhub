-- Stop sending "Booking cancelled" notifications (per user request).
-- Keep trigger as a no-op so we don't have to detach it from the table.
CREATE OR REPLACE FUNCTION public.notify_on_booking_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

-- Mark any outstanding unread "Booking cancelled" notifications as read
-- so users (e.g. Samuel) stop seeing the repeating prompt.
UPDATE public.notifications
SET read = true
WHERE read = false
  AND title = 'Booking cancelled';