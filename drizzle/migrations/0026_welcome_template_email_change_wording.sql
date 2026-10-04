CREATE OR REPLACE FUNCTION public.welcome_template_email_body()
RETURNS text LANGUAGE sql IMMUTABLE AS $$
SELECT '<p>Dear {{first_name}} {{surname}},</p><h2>Activate your SquashHub account</h2><p>{{club_name}} is now using SquashHub. Your existing membership has already been loaded, so you do not need to register as a new member.</p><p>Click the button below to use your unique personal registration link. This link is for you only and should not be shared.</p><p>If this email address is no longer the one you use, you can ask your club administrator to update your email address and resend your personal activation link. Alternatively, you can activate your account using this email address first and update your email address afterwards.</p><p><a href="{{action_url}}" style="display:inline-block;background:#1E3A5F;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px">{{action_label}}</a></p><p>After clicking the button, you''ll be taken to SquashHub to activate your account. You may then be asked to complete any outstanding information on your membership/profile.</p><p>If you use Google with this email address, you can choose Continue with Google and won''t need to create a separate password.</p><p>Need a hand getting started? <a href="https://www.youtube.com/shorts/knRz2-Xik24?feature=share">Watch the SquashHub registration and login video</a>.</p>'::text
$$;

UPDATE public.comms_template_versions v
SET subject = 'Activate your SquashHub account - {{club_name}}', body = public.welcome_template_email_body()
FROM public.comms_templates t
WHERE v.template_id = t.id AND t.name = 'Welcome to SquashHub' AND v.channel = 'email';

UPDATE public.comms_template_versions v
SET body = E'Dear {{first_name}} {{surname}}, {{club_name}} is now using SquashHub. Your existing membership has already been loaded, so you do not need to register as a new member.\n\nActivate your SquashHub account with your unique personal link (for you only, please do not share or forward it): {{action_url}}\n\nIf this email address is no longer the one you use, ask your club administrator to update it and resend your personal link - or activate with this email address first and update it afterwards.\n\nIf you use Google with this email address, you can choose Continue with Google and won''t need a separate password.'
FROM public.comms_templates t
WHERE v.template_id = t.id AND t.name = 'Welcome to SquashHub' AND v.channel = 'whatsapp';