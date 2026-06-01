ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS max_member_events_per_month integer NOT NULL DEFAULT 2;