
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'match',
  ADD COLUMN IF NOT EXISTS ops_purpose text,
  ADD COLUMN IF NOT EXISTS ops_note text,
  ADD COLUMN IF NOT EXISTS ops_photo_url text;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_booking_type_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_type_check
  CHECK (booking_type IN ('match','ops','event','league','tournament'));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_ops_purpose_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_ops_purpose_check
  CHECK (ops_purpose IS NULL OR ops_purpose IN ('cleaning','maintenance','inspection','other'));

CREATE INDEX IF NOT EXISTS idx_bookings_booking_type ON public.bookings(club_id, booking_type);

ALTER TABLE public.recurring_bookings
  ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'match',
  ADD COLUMN IF NOT EXISTS ops_purpose text,
  ADD COLUMN IF NOT EXISTS ops_note text;

ALTER TABLE public.recurring_bookings
  DROP CONSTRAINT IF EXISTS recurring_bookings_booking_type_check;
ALTER TABLE public.recurring_bookings
  ADD CONSTRAINT recurring_bookings_booking_type_check
  CHECK (booking_type IN ('match','ops'));

ALTER TABLE public.recurring_bookings
  DROP CONSTRAINT IF EXISTS recurring_bookings_ops_purpose_check;
ALTER TABLE public.recurring_bookings
  ADD CONSTRAINT recurring_bookings_ops_purpose_check
  CHECK (ops_purpose IS NULL OR ops_purpose IN ('cleaning','maintenance','inspection','other'));

ALTER TABLE public.light_sessions
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'match';

ALTER TABLE public.light_sessions
  DROP CONSTRAINT IF EXISTS light_sessions_purpose_check;
ALTER TABLE public.light_sessions
  ADD CONSTRAINT light_sessions_purpose_check
  CHECK (purpose IN ('match','ops'));

CREATE INDEX IF NOT EXISTS idx_light_sessions_purpose ON public.light_sessions(club_id, purpose);
