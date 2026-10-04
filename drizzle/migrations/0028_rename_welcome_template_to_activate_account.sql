-- Rename the system/default existing-member onboarding template from
-- 'Welcome to SquashHub' to 'Activate SquashHub Account' for ALL clubs.
-- Display name only: subject/body, action key and club customisations are untouched.

-- 1) Rename existing copies (scoped to the onboarding template via its action key).
UPDATE public.comms_templates
SET name = 'Activate SquashHub Account'
WHERE name = 'Welcome to SquashHub'
  AND action->>'key' = 'register_existing_member';

-- 2) Seed function: look up by the new name (falling back to the old name so any
--    pre-rename copy is still found) and insert new clubs with the new name.
CREATE OR REPLACE FUNCTION public.seed_club_welcome_template(p_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF p_club_id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM public.comms_templates
  WHERE club_id = p_club_id
    AND name IN ('Activate SquashHub Account', 'Welcome to SquashHub')
  ORDER BY (name = 'Activate SquashHub Account') DESC
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.comms_templates (club_id, name, category, action)
  VALUES (p_club_id, 'Activate SquashHub Account', 'general',
          jsonb_build_object('key', 'register_existing_member', 'label', 'Activate my SquashHub account'))
  RETURNING id INTO v_id;
  INSERT INTO public.comms_template_versions (template_id, channel, subject, body) VALUES
  (v_id, 'email', 'Activate your SquashHub account - {{club_name}}', public.welcome_template_email_body()),
  (v_id, 'whatsapp', '', E'Dear {{first_name}} {{surname}}, {{club_name}} is now using SquashHub. Your existing membership has already been loaded, so you do not need to register as a new member.\n\nActivate your SquashHub account with your unique personal link (for you only, please do not share or forward it): {{action_url}}\n\nIf you use Google with this email address, you can choose Continue with Google and won''t need a separate password.'),
  (v_id, 'sms', '', '{{club_name}} is now on SquashHub. Activate your account with your personal link (do not share): {{action_url}}'),
  (v_id, 'in_app', 'Activate your SquashHub account', 'Dear {{first_name}} {{surname}}, {{club_name}} is now on SquashHub. Please check that your details are complete and correct.');
  RETURN v_id;
END $function$;