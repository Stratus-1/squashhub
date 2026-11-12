-- Default "Please settle your outstanding account" comms template for every club (new and existing).
CREATE OR REPLACE FUNCTION public.seed_club_settle_account_template(p_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.comms_templates
  WHERE club_id = p_club_id AND name = 'Please settle your outstanding account'
  ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.comms_templates (club_id, name, category, action)
  VALUES (p_club_id, 'Please settle your outstanding account', 'finance',
          jsonb_build_object('key', 'my_account', 'label', 'View and pay my account'))
  RETURNING id INTO v_id;

  INSERT INTO public.comms_template_versions (template_id, channel, subject, body)
  VALUES
    (v_id, 'email', 'Friendly reminder: outstanding account of {{outstanding_amount}} – {{club_name}}',
     '<p>Dear {{greeting_name}},</p>'
     || '<p>Our records show an outstanding amount of <strong>{{outstanding_amount}}</strong> on your account with <strong>{{club_name}}</strong>.</p>'
     || '<p>We kindly request that you settle this amount as soon as possible. The club would much rather not take any further action, and settling your account soonest means none will be needed.</p>'
     || '<p>You can see your statement and pay online under <strong>My Account</strong> (button below).</p>'
     || '<p><strong>If you have already made this payment, please ignore this email.</strong> Thank you.</p>'
     || '<p>If you believe the amount is incorrect or would like to arrange payment, please contact us at {{club_email}} or {{club_phone}}.</p>'
     || '<p>Kind regards,<br>{{club_name}}</p>'),
    (v_id, 'whatsapp', '',
     'Dear {{greeting_name}}, our records show an outstanding amount of {{outstanding_amount}} on your account with {{club_name}}.

We kindly request that you settle this as soon as possible. The club would much rather not take any further action.

View your statement and pay here: {{action_url}}

If you have already made this payment, please ignore this message. Questions: {{club_phone}}'),
    (v_id, 'sms', '',
     '{{club_name}}: Dear {{greeting_name}}, your account shows {{outstanding_amount}} outstanding. Please settle soonest: {{action_url}} If already paid, please ignore.'),
    (v_id, 'in_app', 'Outstanding account: {{outstanding_amount}}',
     'Dear {{greeting_name}}, your account with {{club_name}} shows an outstanding amount of {{outstanding_amount}}. Please settle it as soon as possible so the club does not need to take any further action. If you have already paid, please ignore this message.');

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_club_settle_account_template(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_club_settle_account_template(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_seed_club_welcome_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.seed_club_welcome_template(NEW.id);
  PERFORM public.seed_club_balance_template(NEW.id);
  PERFORM public.seed_club_settle_account_template(NEW.id);
  RETURN NEW;
END;
$function$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.clubs LOOP
    PERFORM public.seed_club_settle_account_template(r.id);
  END LOOP;
END $$;