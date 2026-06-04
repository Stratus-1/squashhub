ALTER TABLE public.club_champs_matches
  ADD COLUMN IF NOT EXISTS bell_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS bell_paused_seconds integer;