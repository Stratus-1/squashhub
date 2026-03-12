
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS payment_gateway text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_gateway_public_key text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_gateway_secret_key text DEFAULT NULL;
