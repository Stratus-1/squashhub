-- Add email sender config columns to clubs table
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS sender_email text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sender_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS smtp_host text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS smtp_port integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS smtp_user text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS smtp_pass text DEFAULT NULL;

-- Add platform-level settings for global email and hcaptcha
INSERT INTO public.app_settings (key, value)
VALUES
  ('platform_sender_email', 'noreply@squashhub.co.za'),
  ('platform_sender_name', 'SquashHub'),
  ('hcaptcha_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- Allow platform admins to manage app_settings
CREATE POLICY "Platform admins can manage settings"
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));