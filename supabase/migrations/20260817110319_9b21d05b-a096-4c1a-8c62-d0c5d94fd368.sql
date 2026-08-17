ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS sla_payment_method text;
DO $$ BEGIN
  ALTER TABLE public.clubs ADD CONSTRAINT clubs_sla_payment_method_check CHECK (sla_payment_method IN ('eft','card'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO public.app_settings (key, value) VALUES ('trial_end_reminder_days','10')
ON CONFLICT (key) DO NOTHING;