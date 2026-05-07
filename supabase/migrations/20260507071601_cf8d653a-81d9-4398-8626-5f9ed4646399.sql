ALTER TABLE public.league_rounds ADD COLUMN end_date date;
UPDATE public.league_rounds SET end_date = round_date WHERE end_date IS NULL;