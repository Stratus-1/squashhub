
-- Add light fee split preference to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS light_fee_split text NOT NULL DEFAULT 'booker';
-- Values: 'booker' (default, booker pays all) or 'shared' (50/50 split with opponent)
