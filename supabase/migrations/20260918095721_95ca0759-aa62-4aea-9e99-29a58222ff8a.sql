
CREATE OR REPLACE FUNCTION public.seed_club_welcome_template(p_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_club_id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_id
  FROM public.comms_templates
  WHERE club_id = p_club_id AND name = 'Welcome to SquashHub'
  LIMIT 1;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.comms_templates (club_id, name, category, action)
  VALUES (
    p_club_id,
    'Welcome to SquashHub',
    'general',
    jsonb_build_object('key', 'register_existing_member', 'label', 'Register as an existing member')
  )
  RETURNING id INTO v_id;

  INSERT INTO public.comms_template_versions (template_id, channel, subject, body) VALUES
  (v_id, 'email', '{{club_name}} has joined SquashHub - please register your membership',
'<p>Dear {{first_name}} {{surname}},</p>
<p>{{club_name}} has joined <strong>SquashHub</strong>, the system the club will use from now on for club administration, leagues and tournaments.</p>
<p>There are two things we need from you:</p>
<ol>
<li><strong>Register as an existing member</strong> - not as a new member. Use the button below, which takes you straight to the existing member registration for {{club_name}}. Your membership, member number and history stay exactly as they are.</li>
<li><strong>Check that your details are complete and correct</strong> - your name and surname, cell number, email address and identity number. If anything is missing or wrong, simply complete or correct it while you register.</li>
</ol>
<p>Please also keep an eye on your WhatsApp. Our club champs start soon and your invitation will come from the SquashHub WhatsApp number.</p>
<p>Thank you,<br/>{{club_name}}</p>'),
  (v_id, 'whatsapp', '',
'Dear {{first_name}} {{surname}}, {{club_name}} has joined SquashHub for club administration, leagues and tournaments.

Please register as an existing member (not a new member) here: {{action_url}}

While you register, please make sure all your details are complete and correct - name, cell number, email and identity number. You can correct anything that is wrong.

Our club champs start soon, so please watch for your invitation from the SquashHub WhatsApp number.

Thank you.'),
  (v_id, 'sms', '',
'{{club_name}} has joined SquashHub. Please register as an existing member and check your details are complete: {{action_url}}'),
  (v_id, 'in_app', 'Welcome to SquashHub',
'Dear {{first_name}} {{surname}}, {{club_name}} is now on SquashHub for club administration, leagues and tournaments. Please complete your existing member registration and check that all your details are correct and complete. Club champs invitations follow soon on WhatsApp.');

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_seed_club_welcome_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_club_welcome_template(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_welcome_template_on_club_insert ON public.clubs;
CREATE TRIGGER seed_welcome_template_on_club_insert
AFTER INSERT ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.tg_seed_club_welcome_template();

SELECT public.seed_club_welcome_template('d8397b8a-60d3-4c4b-afee-25dab218bf19'::uuid);
