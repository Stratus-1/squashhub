INSERT INTO public.whatsapp_templates (key, friendly_name, category, language, body, quick_replies, variables, approval_status)
VALUES (
  'tournament_invite_tap',
  'squashhub_tournament_invite_tap',
  'UTILITY',
  'en',
  'Hello {{2}}, this is a message from *{{1}}* on SquashHub.

You are invited to take part in our upcoming tournament: {{3}}.

Event details: {{4}}

To accept or decline your invitation, tap here: {{5}}

We hope to see you on court.',
  '[]'::jsonb,
  '["club","player","event","details","link"]'::jsonb,
  'draft'
)
ON CONFLICT (key) DO NOTHING;