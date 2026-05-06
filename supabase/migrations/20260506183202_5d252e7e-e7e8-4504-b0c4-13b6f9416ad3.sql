UPDATE public.clubs SET fill_top_down_enabled = true, league_week_start_dow = 3 WHERE fill_top_down_enabled = false OR league_week_start_dow IS DISTINCT FROM 3;

ALTER TABLE public.clubs ALTER COLUMN fill_top_down_enabled SET DEFAULT true;
ALTER TABLE public.clubs ALTER COLUMN league_week_start_dow SET DEFAULT 3;