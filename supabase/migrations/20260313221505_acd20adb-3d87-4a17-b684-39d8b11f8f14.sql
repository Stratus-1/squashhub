ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS duration_s integer;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS notes text;