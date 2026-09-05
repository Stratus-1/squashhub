UPDATE public.whatsapp_templates
SET friendly_name = 'squashhub_otp_code_v4',
    category = 'AUTHENTICATION',
    body = '{{1}} is your verification code. For your security, do not share this code.',
    variables = '["code"]'::jsonb,
    content_sid = NULL,
    approval_status = 'draft',
    approval_error = NULL,
    last_synced_at = NULL
WHERE key = 'otp_code';