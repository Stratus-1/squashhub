DROP INDEX IF EXISTS public.bookings_club_source_external_uidx;
CREATE UNIQUE INDEX bookings_club_source_external_uidx ON public.bookings (club_id, source, external_id);