
ALTER TABLE public.stitch_mandates
  ADD COLUMN IF NOT EXISTS mandate_type text NOT NULL DEFAULT 'card_consent';

-- Existing rows were created via the Express /subscriptions endpoint, so tag
-- them accordingly so they don't get re-charged by the collections job.
UPDATE public.stitch_mandates
  SET mandate_type = 'subscription'
  WHERE mandate_type = 'card_consent'
    AND created_at < now();

ALTER TABLE public.stitch_mandates
  ADD CONSTRAINT stitch_mandates_mandate_type_chk
  CHECK (mandate_type IN ('card_consent','subscription'));
