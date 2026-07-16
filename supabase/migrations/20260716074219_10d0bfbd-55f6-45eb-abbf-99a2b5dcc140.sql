
ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS play_all_games boolean NOT NULL DEFAULT false;
