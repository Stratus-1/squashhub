ALTER TABLE public.club_events
  ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lights_auto_on boolean NOT NULL DEFAULT false;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.club_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_event_id ON public.bookings(event_id) WHERE event_id IS NOT NULL;

-- Link existing event-made bookings to their event so editing an event no
-- longer reports the event's own courts as a clash.
UPDATE public.bookings b
   SET event_id = e.id
  FROM public.club_events e
  JOIN public.club_event_courts ec ON ec.event_id = e.id
 WHERE b.event_id IS NULL
   AND b.source = 'club_event'
   AND b.club_id = e.club_id
   AND b.court_id = ec.court_id
   AND b.start_time = e.start_time
   AND b.end_time = e.end_time
   AND b.guest_name ILIKE '%' || e.title || '%';