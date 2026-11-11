-- 1) New campaign recipient group: members with an outstanding balance.
ALTER TABLE public.comms_campaigns DROP CONSTRAINT IF EXISTS comms_campaigns_audience_type_check;
ALTER TABLE public.comms_campaigns ADD CONSTRAINT comms_campaigns_audience_type_check
  CHECK (audience_type = ANY (ARRAY['all','selected','league','skills','unlinked','outstanding']));

-- 2) Activation template seeder: the previous version wrote columns that do not exist
--    (description, is_active), which made new-club inserts fail. Content matches the live template.
CREATE OR REPLACE FUNCTION public.seed_club_welcome_template(p_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
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

  INSERT INTO public.comms_templates (club_id, name, category, action)
  VALUES (
    p_club_id,
    'Activate SquashHub Account – Unregistered Members',
    'general',
    jsonb_build_object('key', 'register_existing_member', 'label', 'Activate my SquashHub account')
  )
  RETURNING id INTO v_id;

  INSERT INTO public.comms_template_versions (template_id, channel, subject, body)
  VALUES
    (v_id, 'email', 'Activate your SquashHub account – {{club_name}}', public.welcome_template_email_body()),
    (v_id, 'whatsapp', '', 'Dear {{first_name}} {{surname}}, {{club_name}} is now using SquashHub. Your existing membership has already been loaded, so you do not need to register as a new member.

Activate your SquashHub account with your unique personal link (for you only, please do not share or forward it): {{action_url}}

If this email address is no longer the one you use, ask your club administrator to update it and resend your personal link - or activate with this email address first and update it afterwards.

If you use Google with this email address, you can choose Continue with Google and won''t need a separate password.'),
    (v_id, 'sms', '', '{{club_name}} is now on SquashHub. Activate your account with your personal link (do not share): {{action_url}}'),
    (v_id, 'in_app', 'Welcome to SquashHub', 'Dear {{first_name}} {{surname}}, {{club_name}} is now on SquashHub for club administration, leagues and tournaments. Please complete your existing member registration and check that all your details are correct and complete. Club champs invitations follow soon on WhatsApp. Watch the registration and login video: https://www.youtube.com/shorts/knRz2-Xik24?feature=share. You can sign in with Google using the email your club has on file.');

  RETURN v_id;
END;
$function$;

-- 3) Outstanding-balance template seeder (same content every club already has).
CREATE OR REPLACE FUNCTION public.seed_club_balance_template(p_club_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.comms_templates
  WHERE club_id = p_club_id AND name = 'Pay your outstanding balance monthly'
  ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.comms_templates (club_id, name, category, action)
  VALUES (p_club_id, 'Pay your outstanding balance monthly', 'finance',
          jsonb_build_object('key', 'my_account', 'label', 'Open My Account'))
  RETURNING id INTO v_id;

  INSERT INTO public.comms_template_versions (template_id, channel, subject, body)
  VALUES
    (v_id, 'email', 'Pay your outstanding balance monthly – {{club_name}}', '<p>Dear {{first_name}},</p><p>Our records show you have an outstanding balance with <strong>{{club_name}}</strong>. To make it easier, you can now pay it off in monthly instalments, automatically.</p><p><strong>Here is exactly what to do:</strong></p><ol><li>Sign in to SquashHub and open <strong>My Account</strong> (button below).</li><li>Scroll to <strong>Payment methods</strong>. Your outstanding balance is shown there.</li><li><strong>No monthly payment yet?</strong> Tap <strong>Pay monthly</strong>, choose the number of months, check the monthly amount and tap <strong>Continue</strong>.</li><li><strong>Already paying monthly?</strong> Under your monthly payment, choose the number of months and tap <strong>Add to my monthly payment</strong>. Your monthly amount goes up only until the balance is paid, then returns to normal.</li><li>Approve the payment with your bank or card when asked. The first instalment is charged straight away and credited to your account.</li></ol><p>Only the periods the club offers can be chosen, and the offer is open for a limited time. Once your balance is paid, the extra amount stops automatically.</p><p>Questions? Contact the club at {{club_email}} or {{club_phone}}.</p><p>Kind regards,<br>{{club_name}}</p>'),
    (v_id, 'whatsapp', '', 'Hi {{first_name}}, you have an outstanding balance with {{club_name}}. You can now pay it off monthly.

1. Open My Account: {{action_url}}
2. Go to Payment methods – your balance is shown there.
3. No monthly payment yet? Tap "Pay monthly", pick the months, tap Continue.
4. Already paying monthly? Pick the months and tap "Add to my monthly payment" – the extra stops once the balance is paid.
5. Approve the payment with your bank/card.

Offer open for a limited time. Questions: {{club_phone}}'),
    (v_id, 'sms', '', '{{club_name}}: pay your outstanding balance monthly. Open My Account > Payment methods > "Pay monthly" or "Add to my monthly payment": {{action_url}}'),
    (v_id, 'in_app', 'Pay your outstanding balance monthly', 'You can now pay your outstanding balance with {{club_name}} in monthly instalments. Open My Account > Payment methods and tap "Pay monthly" (or "Add to my monthly payment" if you already pay monthly). Choose the months and approve.');

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_club_balance_template(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_club_balance_template(uuid) TO service_role;

-- 4) Every new club gets both standard templates.
CREATE OR REPLACE FUNCTION public.tg_seed_club_welcome_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.seed_club_welcome_template(NEW.id);
  PERFORM public.seed_club_balance_template(NEW.id);
  RETURN NEW;
END;
$function$;

-- 5) Backfill any existing club missing either template (idempotent).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.clubs LOOP
    PERFORM public.seed_club_welcome_template(r.id);
    PERFORM public.seed_club_balance_template(r.id);
  END LOOP;
END $$;