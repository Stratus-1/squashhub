-- Tappable "Pay my fee" button template for members with an outstanding fee.
-- The button URL must have a fixed base (one shared platform template); the
-- per-member invite token is appended as variable {{3}} and the root-host
-- /i/<token> route resolves the member's club automatically.
ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS url_button jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO public.whatsapp_templates (key, friendly_name, description, category, language, body, variables, url_button, approval_status)
SELECT
  'club_notice_pay',
  'squashhub_club_notice_pay',
  'Club notice with a tappable Pay my fee button for members with an outstanding entry fee',
  'UTILITY',
  'en',
  E'Update from *{{1}}*:\n\n{{2}}\n\nThank you.',
  '["club","message","pay_token"]'::jsonb,
  '[{"type":"URL","title":"Pay my fee","url":"https://squashhub.co.za/i/{{3}}"}]'::jsonb,
  'draft'
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE key = 'club_notice_pay');