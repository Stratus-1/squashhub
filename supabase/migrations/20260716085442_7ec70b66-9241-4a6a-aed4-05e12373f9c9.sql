ALTER TABLE public.club_champs_matches
  ADD COLUMN IF NOT EXISTS placeholder_a text,
  ADD COLUMN IF NOT EXISTS placeholder_b text;