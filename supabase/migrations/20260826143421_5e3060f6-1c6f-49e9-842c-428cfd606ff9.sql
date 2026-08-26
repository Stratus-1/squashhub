-- ============ Communications engine ============
CREATE TABLE public.comms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  action JSONB NOT NULL DEFAULT '{}'::jsonb,
  secondary_action JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comms_templates_club ON public.comms_templates(club_id);

CREATE TABLE public.comms_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.comms_templates(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp','in_app')),
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  content_sid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, channel)
);
CREATE INDEX idx_comms_template_versions_tpl ON public.comms_template_versions(template_id);

CREATE TABLE public.comms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.comms_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  channels TEXT[] NOT NULL DEFAULT '{}',
  audience_type TEXT NOT NULL DEFAULT 'all' CHECK (audience_type IN ('all','selected','league','skills')),
  audience_member_ids UUID[] NOT NULL DEFAULT '{}',
  audience_league_id UUID REFERENCES public.leagues(id) ON DELETE SET NULL,
  audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  action JSONB NOT NULL DEFAULT '{}'::jsonb,
  secondary_action JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','partial','failed','cancelled')),
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comms_campaigns_club ON public.comms_campaigns(club_id);
CREATE INDEX idx_comms_campaigns_due ON public.comms_campaigns(status, scheduled_for);

CREATE TABLE public.comms_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.comms_campaigns(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id UUID,
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp','in_app')),
  recipient_name TEXT,
  target TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, club_member_id, channel)
);
CREATE INDEX idx_comms_deliveries_campaign ON public.comms_deliveries(campaign_id);
CREATE INDEX idx_comms_deliveries_club ON public.comms_deliveries(club_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comms_templates TO authenticated;
GRANT ALL ON public.comms_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comms_template_versions TO authenticated;
GRANT ALL ON public.comms_template_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comms_campaigns TO authenticated;
GRANT ALL ON public.comms_campaigns TO service_role;
GRANT SELECT ON public.comms_deliveries TO authenticated;
GRANT ALL ON public.comms_deliveries TO service_role;

ALTER TABLE public.comms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comms_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comms_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins manage comms templates"
ON public.comms_templates FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Club admins manage comms template versions"
ON public.comms_template_versions FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.comms_templates t WHERE t.id = template_id AND public.is_club_admin(auth.uid(), t.club_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.comms_templates t WHERE t.id = template_id AND public.is_club_admin(auth.uid(), t.club_id)));

CREATE POLICY "Club admins manage comms campaigns"
ON public.comms_campaigns FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Club admins view comms deliveries"
ON public.comms_deliveries FOR SELECT TO authenticated
USING (public.is_club_admin(auth.uid(), club_id));

CREATE TRIGGER trg_comms_templates_updated
BEFORE UPDATE ON public.comms_templates
FOR EACH ROW EXECUTE FUNCTION public.touch_email_templates_updated_at();

CREATE TRIGGER trg_comms_template_versions_updated
BEFORE UPDATE ON public.comms_template_versions
FOR EACH ROW EXECUTE FUNCTION public.touch_email_templates_updated_at();

CREATE TRIGGER trg_comms_campaigns_updated
BEFORE UPDATE ON public.comms_campaigns
FOR EACH ROW EXECUTE FUNCTION public.touch_email_templates_updated_at();

-- Bring existing email templates across as email channel versions
INSERT INTO public.comms_templates (id, club_id, name, category, created_by, created_at, updated_at)
SELECT id, club_id, name, 'general', created_by, created_at, updated_at
FROM public.club_email_templates
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.comms_template_versions (template_id, channel, subject, body)
SELECT id, 'email', subject, body_html
FROM public.club_email_templates
ON CONFLICT (template_id, channel) DO NOTHING;
