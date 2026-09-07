
CREATE TABLE public.platform_update_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  action_label text,
  action_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_update_templates TO authenticated;
GRANT ALL ON public.platform_update_templates TO service_role;
ALTER TABLE public.platform_update_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins manage platform templates" ON public.platform_update_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.platform_update_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_id uuid REFERENCES public.platform_update_templates(id) ON DELETE SET NULL,
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  action_label text,
  action_url text,
  channels text[] NOT NULL DEFAULT '{in_app}',
  audience_type text NOT NULL DEFAULT 'all',
  audience_club_ids uuid[] NOT NULL DEFAULT '{}',
  audience_association_id uuid,
  audience_plan_id uuid,
  audience_member_ids uuid[] NOT NULL DEFAULT '{}',
  targeted_club_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_update_campaigns TO authenticated;
GRANT ALL ON public.platform_update_campaigns TO service_role;
ALTER TABLE public.platform_update_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins manage platform campaigns" ON public.platform_update_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.platform_update_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.platform_update_campaigns(id) ON DELETE CASCADE,
  club_id uuid,
  club_member_id uuid,
  user_id uuid,
  recipient_name text,
  club_name text,
  channel text NOT NULL,
  target text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  subject text,
  body text,
  action_label text,
  action_url text,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX platform_update_recipients_uniq
  ON public.platform_update_recipients (campaign_id, coalesce(club_member_id, '00000000-0000-0000-0000-000000000000'::uuid), channel);
CREATE INDEX platform_update_recipients_user_idx ON public.platform_update_recipients (user_id, channel);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_update_recipients TO authenticated;
GRANT ALL ON public.platform_update_recipients TO service_role;
ALTER TABLE public.platform_update_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins manage platform recipients" ON public.platform_update_recipients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "recipients read their own platform updates" ON public.platform_update_recipients
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "recipients mark their own platform updates read" ON public.platform_update_recipients
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER platform_update_templates_touch BEFORE UPDATE ON public.platform_update_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER platform_update_campaigns_touch BEFORE UPDATE ON public.platform_update_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_update_templates (name, subject, body_html, action_label, action_url) VALUES
('New feature announcement', 'New in SquashHub: {{feature}}', '<p>Hi {{first_name}},</p><p>We have just released a new feature for {{club_name}}.</p><p>Have a look and let us know what you think.</p>', 'See what''s new', 'https://squashhub.co.za/club-admin'),
('Action required', 'Action required for {{club_name}}', '<p>Hi {{first_name}},</p><p>We need something from {{club_name}} to keep everything running smoothly.</p><p>Please attend to this at your earliest convenience.</p>', 'Open Club Admin', 'https://squashhub.co.za/club-admin'),
('Scheduled maintenance notice', 'Scheduled SquashHub maintenance', '<p>Hi {{first_name}},</p><p>SquashHub will be undergoing scheduled maintenance. The app may be briefly unavailable.</p>', NULL, NULL),
('Training / help video available', 'New training video available', '<p>Hi {{first_name}},</p><p>A new help video is available to guide you and your committee through SquashHub.</p>', 'Watch the video', 'https://squashhub.co.za/help'),
('WhatsApp and SMS now available', 'WhatsApp and SMS messaging is now available', '<p>Hi {{first_name}},</p><p>{{club_name}} can now message members by WhatsApp and SMS straight from SquashHub. WhatsApp is used when a reply is needed, SMS for one-way notices.</p>', 'Turn on messaging', 'https://squashhub.co.za/club-admin'),
('Product release notes', 'SquashHub release notes', '<p>Hi {{first_name}},</p><p>Here is what changed in the latest SquashHub release.</p><ul><li>Improvement one</li><li>Improvement two</li></ul>', 'Open SquashHub', 'https://squashhub.co.za');
