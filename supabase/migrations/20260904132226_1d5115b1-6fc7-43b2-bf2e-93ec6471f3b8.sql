CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  friendly_name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'UTILITY',
  language text NOT NULL DEFAULT 'en',
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  quick_replies jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_sid text,
  approval_status text NOT NULL DEFAULT 'draft',
  approval_error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read whatsapp templates" ON public.whatsapp_templates;
CREATE POLICY "Authenticated can read whatsapp templates"
  ON public.whatsapp_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Platform admins manage whatsapp templates" ON public.whatsapp_templates;
CREATE POLICY "Platform admins manage whatsapp templates"
  ON public.whatsapp_templates FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

INSERT INTO public.whatsapp_templates (key, friendly_name, description, category, body, variables, quick_replies)
VALUES
  ('club_notice', 'squashhub_club_notice',
   'Generic club notice. Used for any app-generated message: quick announcements, campaign sends, reminders.',
   'UTILITY',
   '*{{1}}*' || chr(10) || chr(10) || '{{2}}' || chr(10) || chr(10) || '{{3}}',
   '["club","message","link"]'::jsonb, '[]'::jsonb),
  ('tournament_invite', 'squashhub_tournament_invite',
   'Invitation to enter a tournament. The details line carries singles / doubles / category wording.',
   'UTILITY',
   'Hi {{2}}, {{1}} has invited you to *{{3}}*.' || chr(10) || chr(10) || '{{4}}' || chr(10) || chr(10) || 'Enter here: {{5}}',
   '["club","player","event","details","link"]'::jsonb, '[]'::jsonb),
  ('tournament_entry_confirmed', 'squashhub_tournament_entry_confirmed',
   'Confirms an accepted / paid tournament entry (also used for doubles pair confirmation).',
   'UTILITY',
   'Hi {{2}}, your entry for *{{3}}* at {{1}} is confirmed.' || chr(10) || chr(10) || '{{4}}' || chr(10) || chr(10) || '{{5}}',
   '["club","player","event","details","link"]'::jsonb, '[]'::jsonb),
  ('tournament_match_scheduled', 'squashhub_tournament_match',
   'Tells a player about their next match: opponent, time and court.',
   'UTILITY',
   '{{1}} - *{{2}}*' || chr(10) || chr(10) || 'Your next match: {{3}}' || chr(10) || '{{4}}' || chr(10) || chr(10) || '{{5}}',
   '["club","event","opponent","when_where","link"]'::jsonb, '[]'::jsonb),
  ('tournament_result', 'squashhub_tournament_result',
   'Result notification after a match is captured, including what happens next.',
   'UTILITY',
   '{{1}} - *{{2}}*' || chr(10) || chr(10) || '{{3}}' || chr(10) || '{{4}}' || chr(10) || chr(10) || '{{5}}',
   '["club","event","result","next_step","link"]'::jsonb, '[]'::jsonb),
  ('rsvp_question', 'squashhub_rsvp_question',
   'Yes / No question whose reply is written back into the app (RSVPs, entry confirmations).',
   'UTILITY',
   '*{{1}}*' || chr(10) || chr(10) || '{{2}}' || chr(10) || chr(10) || '{{3}}',
   '["club","question","details"]'::jsonb, '["Yes","No"]'::jsonb),
  ('otp_code', 'squashhub_otp_code',
   'One-time code for bar account charges and verification.',
   'AUTHENTICATION',
   'Your {{1}} verification code is {{2}}. It expires in {{3}} minutes.',
   '["club","code","minutes"]'::jsonb, '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_whatsapp_templates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_whatsapp_templates ON public.whatsapp_templates;
CREATE TRIGGER trg_touch_whatsapp_templates
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_whatsapp_templates();