ALTER TABLE public.courts
ADD COLUMN IF NOT EXISTS relay_channel integer NOT NULL DEFAULT 0;

ALTER TABLE public.courts
DROP CONSTRAINT IF EXISTS courts_relay_channel_valid;

ALTER TABLE public.courts
ADD CONSTRAINT courts_relay_channel_valid CHECK (relay_channel >= 0 AND relay_channel <= 3);