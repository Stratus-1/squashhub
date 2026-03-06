-- Connected integrations (Strava now; Apple Health / Samsung Health / Garmin as placeholders)
-- Security model:
-- - integrations_accounts: user-visible metadata (RLS: user can read own rows)
-- - integrations_tokens: sensitive tokens (RLS enabled, no policies => client cannot read)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integration_provider') THEN
    CREATE TYPE public.integration_provider AS ENUM ('strava', 'apple_health', 'samsung_health', 'garmin');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.integrations_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider public.integration_provider NOT NULL,
  provider_user_id text,
  display_name text,
  scopes text,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error', 'disconnected')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.integrations_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own integrations"
  ON public.integrations_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own integrations"
  ON public.integrations_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
  ON public.integrations_accounts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_integrations_accounts_updated_at
  BEFORE UPDATE ON public.integrations_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.integrations_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider public.integration_provider NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  token_type text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.integrations_tokens ENABLE ROW LEVEL SECURITY;

-- Intentionally no SELECT/INSERT/UPDATE policies for authenticated users.
-- Access should happen only via service role (edge functions).

CREATE TRIGGER update_integrations_tokens_updated_at
  BEFORE UPDATE ON public.integrations_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

