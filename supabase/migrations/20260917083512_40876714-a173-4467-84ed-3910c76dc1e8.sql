ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days');

CREATE INDEX IF NOT EXISTS challenges_expires_at_idx
  ON public.challenges (expires_at)
  WHERE status IN ('pending','accepted');