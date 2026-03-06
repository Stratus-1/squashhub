-- Device push tokens for native apps (Capacitor)
-- Stores FCM/APNS-backed tokens from @capacitor/push-notifications.

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS device_push_tokens_unique_user_token
  ON public.device_push_tokens(user_id, token);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can manage their own device tokens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'device_push_tokens' AND policyname = 'Users can manage own device tokens'
  ) THEN
    CREATE POLICY "Users can manage own device tokens"
      ON public.device_push_tokens FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS update_device_push_tokens_updated_at ON public.device_push_tokens;
CREATE TRIGGER update_device_push_tokens_updated_at
  BEFORE UPDATE ON public.device_push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

