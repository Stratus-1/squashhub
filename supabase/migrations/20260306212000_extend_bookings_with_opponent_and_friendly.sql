-- Extend bookings to support inviting an opponent + friendly matches
-- - opponent_id: optional second player
-- - is_friendly: friendly games are not ladder-recordable (no challenge created)
-- - challenge_id: if present, booking is linked to a ladder challenge

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS opponent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_friendly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS challenge_id uuid REFERENCES public.challenges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_opponent_id_idx ON public.bookings(opponent_id);
CREATE INDEX IF NOT EXISTS bookings_challenge_id_idx ON public.bookings(challenge_id);

