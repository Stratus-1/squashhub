ALTER TABLE public.bookings ADD COLUMN opponent_id uuid DEFAULT NULL;
ALTER TABLE public.bookings ADD COLUMN is_friendly boolean NOT NULL DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN guest_name text DEFAULT NULL;