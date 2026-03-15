
-- Create club_secrets table for sensitive credentials
CREATE TABLE public.club_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE UNIQUE,
  smtp_host text,
  smtp_port integer,
  smtp_user text,
  smtp_pass text,
  sender_email text,
  sender_name text,
  payment_gateway_secret_key text,
  shelly_auth_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_secrets ENABLE ROW LEVEL SECURITY;

-- Only club admins can read secrets
CREATE POLICY "Club admins can select secrets"
  ON public.club_secrets FOR SELECT TO authenticated
  USING (is_club_admin(auth.uid(), club_id));

-- Only club admins can insert secrets
CREATE POLICY "Club admins can insert secrets"
  ON public.club_secrets FOR INSERT TO authenticated
  WITH CHECK (is_club_admin(auth.uid(), club_id));

-- Only club admins can update secrets
CREATE POLICY "Club admins can update secrets"
  ON public.club_secrets FOR UPDATE TO authenticated
  USING (is_club_admin(auth.uid(), club_id));

-- Only club admins can delete secrets
CREATE POLICY "Club admins can delete secrets"
  ON public.club_secrets FOR DELETE TO authenticated
  USING (is_club_admin(auth.uid(), club_id));

-- Migrate existing data from clubs to club_secrets
INSERT INTO public.club_secrets (club_id, smtp_host, smtp_port, smtp_user, smtp_pass, sender_email, sender_name, payment_gateway_secret_key, shelly_auth_key)
SELECT id, smtp_host, smtp_port, smtp_user, smtp_pass, sender_email, sender_name, payment_gateway_secret_key, shelly_auth_key
FROM public.clubs
WHERE smtp_host IS NOT NULL 
   OR smtp_user IS NOT NULL
   OR smtp_pass IS NOT NULL
   OR sender_email IS NOT NULL
   OR payment_gateway_secret_key IS NOT NULL 
   OR shelly_auth_key IS NOT NULL;

-- NULL out sensitive data in clubs table so it's no longer exposed
UPDATE public.clubs SET
  smtp_host = NULL,
  smtp_port = NULL,
  smtp_user = NULL,
  smtp_pass = NULL,
  sender_email = NULL,
  sender_name = NULL,
  payment_gateway_secret_key = NULL,
  shelly_auth_key = NULL;
