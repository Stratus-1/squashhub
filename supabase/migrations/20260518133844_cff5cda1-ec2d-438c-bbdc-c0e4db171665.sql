
CREATE TABLE public.club_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_club_email_templates_club ON public.club_email_templates(club_id);

CREATE TABLE public.club_email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.club_email_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('all','selected','league')),
  audience_member_ids UUID[] DEFAULT '{}',
  audience_league_id UUID REFERENCES public.leagues(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','sent','failed')),
  total_recipients INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_by UUID,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_club_email_campaigns_club ON public.club_email_campaigns(club_id);

CREATE TABLE public.club_email_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.club_email_campaigns(id) ON DELETE CASCADE,
  club_member_id UUID,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_recipients_campaign ON public.club_email_campaign_recipients(campaign_id);

ALTER TABLE public.club_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_email_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins manage email templates"
ON public.club_email_templates FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Club admins manage campaigns"
ON public.club_email_campaigns FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Club admins view campaign recipients"
ON public.club_email_campaign_recipients FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_email_campaigns c
  WHERE c.id = campaign_id AND public.is_club_admin(auth.uid(), c.club_id)
));

CREATE OR REPLACE FUNCTION public.touch_email_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_email_templates_updated
BEFORE UPDATE ON public.club_email_templates
FOR EACH ROW EXECUTE FUNCTION public.touch_email_templates_updated_at();

CREATE TRIGGER trg_email_campaigns_updated
BEFORE UPDATE ON public.club_email_campaigns
FOR EACH ROW EXECUTE FUNCTION public.touch_email_templates_updated_at();
