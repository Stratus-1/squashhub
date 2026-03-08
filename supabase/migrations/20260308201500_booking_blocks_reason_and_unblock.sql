-- Court blocking improvements
-- - Store block reason on bookings
-- - Distinguish blocks from player bookings via is_blocked
-- - Ensure blocked bookings cannot be ladder/challenge-linked

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_reason text,
  ADD COLUMN IF NOT EXISTS blocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

-- Keep blocked bookings "friendly" and not tied to challenges/opponents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_blocked_invariants'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_blocked_invariants
      CHECK (
        NOT is_blocked
        OR (
          opponent_id IS NULL
          AND is_friendly = true
          AND challenge_id IS NULL
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bookings_is_blocked_idx
  ON public.bookings(is_blocked)
  WHERE is_blocked = true;

