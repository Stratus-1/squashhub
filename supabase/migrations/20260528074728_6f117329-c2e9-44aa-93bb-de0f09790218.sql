
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'squashhub',
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS external_booker_name TEXT;

ALTER TABLE public.bookings ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_source_user_chk;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_source_user_chk
  CHECK (user_id IS NOT NULL OR source <> 'squashhub');

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_source_chk;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_source_chk CHECK (source IN ('squashhub','gobook'));

CREATE UNIQUE INDEX IF NOT EXISTS bookings_club_source_external_uidx
  ON public.bookings (club_id, source, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE public.member_gobook_credentials
  ADD COLUMN IF NOT EXISTS is_sync_source BOOLEAN NOT NULL DEFAULT true;
