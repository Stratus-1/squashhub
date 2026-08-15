ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS host_court_fee_cents_per_hour integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS host_cleaning_fee_cents_per_day integer NOT NULL DEFAULT 0;

INSERT INTO public.app_settings (key, value)
VALUES ('platform_tournament_fee_pct', '3'::jsonb)
ON CONFLICT (key) DO NOTHING;