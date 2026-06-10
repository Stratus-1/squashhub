ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS points_per_game smallint NOT NULL DEFAULT 11,
  ADD COLUMN IF NOT EXISTS best_of smallint NOT NULL DEFAULT 5;

ALTER TABLE public.club_champs
  DROP CONSTRAINT IF EXISTS club_champs_points_per_game_check;
ALTER TABLE public.club_champs
  ADD CONSTRAINT club_champs_points_per_game_check CHECK (points_per_game IN (11, 15));

ALTER TABLE public.club_champs
  DROP CONSTRAINT IF EXISTS club_champs_best_of_check;
ALTER TABLE public.club_champs
  ADD CONSTRAINT club_champs_best_of_check CHECK (best_of IN (3, 5));