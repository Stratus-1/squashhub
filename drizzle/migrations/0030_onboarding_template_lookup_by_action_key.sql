CREATE OR REPLACE FUNCTION public.seed_club_welcome_template(p_club_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  -- Identify the onboarding template by its stable action key, not its display name.
  SELECT id INTO v_id FROM public.comms_templates
  WHERE club_id = p_club_id
    AND action->>'key' = 'register_existing_member'
  ORDER BY CASE name
    WHEN 'Activate SquashHub Account – Unregistered Members' THEN 0
    WHEN 'Activate SquashHub Account' THEN 1
    WHEN 'Welcome to SquashHub' THEN 2
    ELSE 3 END, created_at
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.comms_templates (club_id, name, description, action, is_active)
  VALUES (
    p_club_id,
    'Activate SquashHub Account – Unregistered Members',
    'Standard onboarding email for existing club members whose membership is loaded but who are not yet linked to a SquashHub account. Sends a unique personal activation link per recipient.',
    jsonb_build_object('key', 'register_existing_member', 'label', 'Activate my SquashHub account'),
    true
  )
  RETURNING id INTO v_id;

  INSERT INTO public.comms_template_versions (template_id, channel, subject, body)
  VALUES
    (v_id, 'email', 'Activate your SquashHub account – {{club_name}}', public.welcome_template_email_body()),
    (v_id, 'whatsapp', NULL, 'Activate your SquashHub account: {{club_name}} has loaded your membership. Use your personal link to activate: {{action_link}}'),
    (v_id, 'sms', NULL, 'Activate your SquashHub account: {{action_link}}'),
    (v_id, 'in_app', 'Activate your SquashHub account', 'Your membership at {{club_name}} is loaded. Use your personal activation link: {{action_link}}');

  RETURN v_id;
END;
$function$;