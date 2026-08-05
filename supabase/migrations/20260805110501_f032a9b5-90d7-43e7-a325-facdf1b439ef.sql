ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS door_auto_unlock_radius_m integer NOT NULL DEFAULT 5;