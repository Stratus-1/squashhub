UPDATE public.member_gobook_credentials
SET last_verification_status = 'captcha_blocked'
WHERE last_verification_status = 'invalid';