INSERT INTO public.whatsapp_templates (key, friendly_name, description, category, language, body, variables, quick_replies, approval_status)
VALUES (
  'tournament_notice',
  'squashhub_tournament_notice',
  'Editable tournament invitation, reminder or update with recipient personalisation.',
  'UTILITY',
  'en',
  'Tournament update from *{{1}}*.' || chr(10) || chr(10) ||
  'Dear {{2}},' || chr(10) || chr(10) ||
  '{{3}}' || chr(10) || chr(10) ||
  'To view your tournament entry, tap here: {{4}}' || chr(10) || chr(10) ||
  'Thank you.',
  '["club","player","message","link"]'::jsonb,
  '[]'::jsonb,
  'draft'
)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  language = EXCLUDED.language,
  body = EXCLUDED.body,
  variables = EXCLUDED.variables,
  quick_replies = EXCLUDED.quick_replies,
  content_sid = CASE
    WHEN public.whatsapp_templates.body IS DISTINCT FROM EXCLUDED.body
      OR public.whatsapp_templates.variables IS DISTINCT FROM EXCLUDED.variables
    THEN NULL
    ELSE public.whatsapp_templates.content_sid
  END,
  approval_status = CASE
    WHEN public.whatsapp_templates.body IS DISTINCT FROM EXCLUDED.body
      OR public.whatsapp_templates.variables IS DISTINCT FROM EXCLUDED.variables
    THEN 'draft'
    ELSE public.whatsapp_templates.approval_status
  END,
  approval_error = NULL;