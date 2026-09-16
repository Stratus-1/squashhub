ALTER TABLE public.club_champs_registrations
  DROP CONSTRAINT IF EXISTS club_champs_registrations_confirmation_source_check;

ALTER TABLE public.club_champs_registrations
  ADD CONSTRAINT club_champs_registrations_confirmation_source_check
  CHECK (confirmation_source IS NULL OR confirmation_source = ANY (ARRAY['rsvp'::text,'payment'::text,'admin'::text,'invite_link'::text,'withdrawn'::text]));