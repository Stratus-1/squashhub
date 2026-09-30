UPDATE public.comms_template_versions AS v
SET body = CASE v.channel
  WHEN 'email' THEN v.body || E'\n<p>Need a hand getting started? <a href="https://www.youtube.com/shorts/knRz2-Xik24?feature=share">Watch the SquashHub registration and login video</a>.</p><p>If you use Google, choose the Google account with the same email address the club has on file. This helps keep your existing membership and playing history together; no password is needed.</p>'
  WHEN 'whatsapp' THEN v.body || E'\n\nNeed help logging in? Watch this short registration video: https://www.youtube.com/shorts/knRz2-Xik24?feature=share\n\nYou can also use Google with the email address the club has on file to keep your existing membership and playing history. No password needed.'
  WHEN 'in_app' THEN v.body || E' Watch the registration and login video: https://www.youtube.com/shorts/knRz2-Xik24?feature=share. You can sign in with Google using the email your club has on file.'
  ELSE v.body END
FROM public.comms_templates AS t
WHERE v.template_id = t.id
  AND t.club_id = 'd8397b8a-60d3-4c4b-afee-25dab218bf19'::uuid
  AND t.name = 'Welcome to SquashHub'
  AND v.channel IN ('email', 'whatsapp', 'in_app')
  AND v.body NOT LIKE '%knRz2-Xik24%';