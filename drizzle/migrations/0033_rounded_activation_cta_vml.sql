CREATE OR REPLACE FUNCTION public.welcome_template_email_body()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT '<p>Dear {{first_name}} {{surname}},</p>'
    || '<h2>Activate your SquashHub account</h2>'
    || '<p>{{club_name}} is now using SquashHub. Your existing membership has already been loaded, so you do not need to register as a new member.</p>'
    || '<p>Click the button below to use your unique personal registration link. This link is for you only and should not be shared.</p>'
    || '<p>If this email address is no longer the one you use, you can ask your club administrator to update your email address and resend your personal activation link. Alternatively, you can activate your account using this email address first and update your email address afterwards.</p>'
    || '<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{action_url}}" style="height:54px;v-text-anchor:middle;width:340px;" arcsize="20%" stroke="f" fillcolor="#1E3A5F"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;">{{action_label}}</center></v:roundrect><![endif]--><!--[if !mso]><!-- --><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0"><tr><td bgcolor="#1E3A5F" style="background-color:#1E3A5F;border-radius:10px"><a href="{{action_url}}" style="display:inline-block;padding:16px 36px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.4;color:#ffffff;text-decoration:none;border-radius:10px"><span style="color:#ffffff">{{action_label}}</span></a></td></tr></table><!--<![endif]-->'
    || '<p>After clicking the button, you''ll be taken to SquashHub to activate your account. You may then be asked to complete any outstanding information on your membership/profile.</p>'
    || '<p>If you use Google with this email address, you can choose Continue with Google and won''t need to create a separate password.</p>'
    || '<p>Still having trouble? If you need to register manually, <a href="https://www.youtube.com/shorts/knRz2-Xik24?feature=share">watch the SquashHub registration and login video</a> for step-by-step guidance.</p>';
$$;

UPDATE comms_template_versions v
SET body = replace(
  v.body,
  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0"><tr><td bgcolor="#1E3A5F" style="background-color:#1E3A5F;border-radius:10px"><a href="{{action_url}}" style="display:inline-block;padding:16px 36px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.4;color:#ffffff;text-decoration:none;border-radius:10px"><span style="color:#ffffff">{{action_label}}</span></a></td></tr></table>',
  '<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{action_url}}" style="height:54px;v-text-anchor:middle;width:340px;" arcsize="20%" stroke="f" fillcolor="#1E3A5F"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;">{{action_label}}</center></v:roundrect><![endif]--><!--[if !mso]><!-- --><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0"><tr><td bgcolor="#1E3A5F" style="background-color:#1E3A5F;border-radius:10px"><a href="{{action_url}}" style="display:inline-block;padding:16px 36px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.4;color:#ffffff;text-decoration:none;border-radius:10px"><span style="color:#ffffff">{{action_label}}</span></a></td></tr></table><!--<![endif]-->'
)
FROM comms_templates t
WHERE t.id = v.template_id
  AND t.name = 'Activate SquashHub Account – Unregistered Members'
  AND v.channel = 'email'
  AND v.body LIKE '%bgcolor="#1E3A5F"%'
  AND v.body NOT LIKE '%v:roundrect%';