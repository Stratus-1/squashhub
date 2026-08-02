-- Prospects
CREATE TABLE public.outreach_prospects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_name TEXT NOT NULL,
  association TEXT,
  city TEXT,
  country TEXT NOT NULL DEFAULT 'South Africa',
  courts INTEGER,
  website TEXT,
  is_nsa BOOLEAN NOT NULL DEFAULT false,
  source TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  owner_user_id UUID,
  follow_up_date DATE,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_prospects TO authenticated;
GRANT ALL ON public.outreach_prospects TO service_role;
ALTER TABLE public.outreach_prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins manage prospects" ON public.outreach_prospects
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Contacts
CREATE TABLE public.outreach_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES public.outreach_prospects(id) ON DELETE CASCADE,
  name TEXT,
  role TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  opted_out BOOLEAN NOT NULL DEFAULT false,
  bounced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX outreach_contacts_email_uniq ON public.outreach_contacts (lower(email));
CREATE INDEX outreach_contacts_prospect_idx ON public.outreach_contacts (prospect_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_contacts TO authenticated;
GRANT ALL ON public.outreach_contacts TO service_role;
ALTER TABLE public.outreach_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins manage contacts" ON public.outreach_contacts
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Campaigns
CREATE TABLE public.outreach_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  preheader TEXT,
  video_desktop_url TEXT,
  video_mobile_url TEXT,
  video_thumb_url TEXT,
  audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  daily_cap INTEGER NOT NULL DEFAULT 30,
  send_delay_ms INTEGER NOT NULL DEFAULT 4000,
  status TEXT NOT NULL DEFAULT 'draft',
  last_run_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_campaigns TO authenticated;
GRANT ALL ON public.outreach_campaigns TO service_role;
ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins manage campaigns" ON public.outreach_campaigns
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Recipients
CREATE TABLE public.outreach_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES public.outreach_prospects(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.outreach_contacts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  send_status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  open_count INTEGER NOT NULL DEFAULT 0,
  first_clicked_at TIMESTAMPTZ,
  click_count INTEGER NOT NULL DEFAULT 0,
  reply_status TEXT,
  reply_note TEXT,
  follow_up_date DATE,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);
CREATE INDEX outreach_recipients_campaign_idx ON public.outreach_recipients (campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_recipients TO authenticated;
GRANT ALL ON public.outreach_recipients TO service_role;
ALTER TABLE public.outreach_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins manage recipients" ON public.outreach_recipients
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Events
CREATE TABLE public.outreach_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id UUID REFERENCES public.outreach_recipients(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.outreach_contacts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outreach_events_campaign_idx ON public.outreach_events (campaign_id, created_at DESC);
GRANT SELECT ON public.outreach_events TO authenticated;
GRANT ALL ON public.outreach_events TO service_role;
ALTER TABLE public.outreach_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins read events" ON public.outreach_events
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Tracked links
CREATE TABLE public.outreach_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outreach_links_campaign_idx ON public.outreach_links (campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_links TO authenticated;
GRANT ALL ON public.outreach_links TO service_role;
ALTER TABLE public.outreach_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins manage links" ON public.outreach_links
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.outreach_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_outreach_prospects_updated BEFORE UPDATE ON public.outreach_prospects
  FOR EACH ROW EXECUTE FUNCTION public.outreach_touch_updated_at();
CREATE TRIGGER trg_outreach_contacts_updated BEFORE UPDATE ON public.outreach_contacts
  FOR EACH ROW EXECUTE FUNCTION public.outreach_touch_updated_at();
CREATE TRIGGER trg_outreach_campaigns_updated BEFORE UPDATE ON public.outreach_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.outreach_touch_updated_at();
CREATE TRIGGER trg_outreach_recipients_updated BEFORE UPDATE ON public.outreach_recipients
  FOR EACH ROW EXECUTE FUNCTION public.outreach_touch_updated_at();