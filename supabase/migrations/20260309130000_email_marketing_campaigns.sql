-- Email marketing: templates + scheduled campaigns
-- Sends are queued as `public.notifications` rows of type `marketing`.
-- Email delivery is handled by the existing notifications->email trigger + edge function.

-- 1) Private internal secret (for background schedulers calling RPC without a user JWT)
INSERT INTO public.app_settings (key, value)
VALUES (
  'email_campaigns_private_internal_secret',
  encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'hex')
)
ON CONFLICT (key) DO NOTHING;

-- 2) Templates
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  text text NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'email_templates' AND policyname = 'Admins can manage email templates'
  ) THEN
    CREATE POLICY "Admins can manage email templates"
      ON public.email_templates FOR ALL TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()))
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Campaigns
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  audience text NOT NULL DEFAULT 'marketing_opt_in',
  template_id uuid NOT NULL REFERENCES public.email_templates(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','queued','cancelled')),
  send_at timestamptz NULL,
  subject_override text NULL,
  preview_text text NULL,
  url text NULL,
  queued_at timestamptz NULL,
  last_queued_count integer NOT NULL DEFAULT 0,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_campaigns_status_send_at_idx ON public.email_campaigns(status, send_at);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'email_campaigns' AND policyname = 'Admins can manage email campaigns'
  ) THEN
    CREATE POLICY "Admins can manage email campaigns"
      ON public.email_campaigns FOR ALL TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()))
      WITH CHECK (public.is_admin_or_moderator(auth.uid()));
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_email_campaigns_updated_at ON public.email_campaigns;
CREATE TRIGGER update_email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Queue a marketing campaign (admin JWT OR internal secret)
CREATE OR REPLACE FUNCTION public.queue_marketing_email_campaign(
  p_campaign_id uuid,
  p_internal_secret text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_secret text;
  allowed boolean := false;
  campaign_row public.email_campaigns%ROWTYPE;
  template_row public.email_templates%ROWTYPE;
  recipients_queued integer := 0;
  subject_template text;
  preview text;
  link_url text;
BEGIN
  allowed := public.is_admin_or_moderator(auth.uid());
  IF allowed IS NOT TRUE THEN
    SELECT value INTO expected_secret FROM public.app_settings WHERE key = 'email_campaigns_private_internal_secret';
    IF expected_secret IS NULL OR p_internal_secret IS NULL OR expected_secret <> p_internal_secret THEN
      RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO campaign_row FROM public.email_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  IF campaign_row.status IN ('queued','cancelled') THEN
    RETURN jsonb_build_object('ok', true, 'campaign_id', campaign_row.id, 'status', campaign_row.status, 'queued', 0);
  END IF;

  SELECT * INTO template_row FROM public.email_templates WHERE id = campaign_row.template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  subject_template := COALESCE(NULLIF(trim(campaign_row.subject_override), ''), template_row.subject);
  preview := COALESCE(NULLIF(trim(campaign_row.preview_text), ''), 'Club update from GB Squash');
  link_url := COALESCE(NULLIF(trim(campaign_row.url), ''), '/events');

  -- Queue notifications for opted-in users only.
  INSERT INTO public.notifications (user_id, title, message, type, url, data)
  SELECT
    p.id,
    subject_template,
    preview,
    'marketing',
    link_url,
    jsonb_build_object(
      'kind', 'email_campaign',
      'campaign_id', campaign_row.id,
      'campaign_name', campaign_row.name,
      'template_id', template_row.id,
      'audience', campaign_row.audience,
      'email', jsonb_build_object(
        'subject', subject_template,
        'html', template_row.html,
        'text', COALESCE(template_row.text, '')
      ),
      'merge', jsonb_build_object(
        'name', COALESCE(p.name, ''),
        'email', trim(p.email)
      )
    )
  FROM public.notification_preferences np
  JOIN public.profiles p ON p.id = np.user_id
  WHERE np.marketing_email_enabled IS TRUE
    AND p.email IS NOT NULL
    AND length(trim(p.email)) > 3;

  GET DIAGNOSTICS recipients_queued = ROW_COUNT;

  UPDATE public.email_campaigns
  SET status = 'queued',
      queued_at = now(),
      last_queued_count = recipients_queued
  WHERE id = campaign_row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', campaign_row.id,
    'status', 'queued',
    'queued', recipients_queued
  );
END;
$$;

-- 5) Process due scheduled campaigns (admin JWT OR internal secret)
CREATE OR REPLACE FUNCTION public.process_due_marketing_email_campaigns(
  p_limit integer DEFAULT 5,
  p_internal_secret text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected_secret text;
  allowed boolean := false;
  row record;
  processed jsonb := '[]'::jsonb;
BEGIN
  allowed := public.is_admin_or_moderator(auth.uid());
  IF allowed IS NOT TRUE THEN
    SELECT value INTO expected_secret FROM public.app_settings WHERE key = 'email_campaigns_private_internal_secret';
    IF expected_secret IS NULL OR p_internal_secret IS NULL OR expected_secret <> p_internal_secret THEN
      RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR row IN
    SELECT id
    FROM public.email_campaigns
    WHERE status = 'scheduled'
      AND send_at IS NOT NULL
      AND send_at <= now()
    ORDER BY send_at ASC
    LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 5), 50))
  LOOP
    processed := processed || jsonb_build_array(public.queue_marketing_email_campaign(row.id, p_internal_secret));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'processed', processed);
END;
$$;

