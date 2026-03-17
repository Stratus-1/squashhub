
ALTER TABLE public.club_secrets
ADD COLUMN IF NOT EXISTS payment_gateway_credentials jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.club_secrets.payment_gateway_credentials IS 'Flexible JSON storage for gateway-specific credentials (merchant_id, merchant_key, passphrase, api_key, entity_id, etc.)';
