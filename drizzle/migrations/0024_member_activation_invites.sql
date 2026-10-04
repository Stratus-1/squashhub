CREATE TABLE public.member_activation_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  campaign_id uuid,
  issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid,
  revoked_at timestamptz
);
CREATE INDEX idx_member_activation_invites_member ON public.member_activation_invites(club_member_id);
GRANT SELECT ON public.member_activation_invites TO authenticated;
GRANT ALL ON public.member_activation_invites TO service_role;
ALTER TABLE public.member_activation_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins can view activation invites" ON public.member_activation_invites
  FOR SELECT TO authenticated USING (public.is_club_admin(auth.uid(), club_id));

-- Issue a personal activation code (server-only). Returns the plain code once; only its hash is stored.
CREATE OR REPLACE FUNCTION public.issue_member_activation_token(_club_member_id uuid, _campaign_id uuid DEFAULT NULL, _issued_by uuid DEFAULT NULL, _days int DEFAULT 14)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE m record; v_token text;
BEGIN
  SELECT id, club_id, user_id INTO m FROM public.club_members WHERE id = _club_member_id;
  IF m.id IS NULL OR m.user_id IS NOT NULL THEN RETURN NULL; END IF;
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  INSERT INTO public.member_activation_invites (club_id, club_member_id, token_hash, campaign_id, issued_by, expires_at)
  VALUES (m.club_id, m.id, encode(extensions.digest(v_token, 'sha256'), 'hex'), _campaign_id, _issued_by,
          now() + make_interval(days => greatest(1, least(coalesce(_days, 14), 60))));
  RETURN v_token;
END $$;
REVOKE ALL ON FUNCTION public.issue_member_activation_token(uuid, uuid, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_member_activation_token(uuid, uuid, uuid, int) TO service_role;

-- Public: what does this link point at? Valid links reveal only first name + email the club has on file.
CREATE OR REPLACE FUNCTION public.resolve_member_activation(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE i record; m record; c record; v_status text;
BEGIN
  IF coalesce(length(_token), 0) < 20 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO i FROM public.member_activation_invites WHERE token_hash = encode(extensions.digest(_token, 'sha256'), 'hex');
  IF i.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT id, name, email, user_id INTO m FROM public.club_members WHERE id = i.club_member_id;
  SELECT name, subdomain INTO c FROM public.clubs WHERE id = i.club_id;
  v_status := CASE
    WHEN i.used_at IS NOT NULL OR m.user_id IS NOT NULL THEN 'claimed'
    WHEN i.revoked_at IS NOT NULL THEN 'revoked'
    WHEN i.expires_at < now() THEN 'expired'
    ELSE 'valid' END;
  IF v_status <> 'valid' THEN
    RETURN jsonb_build_object('status', v_status, 'club_name', c.name, 'club_subdomain', c.subdomain);
  END IF;
  RETURN jsonb_build_object('status', 'valid', 'club_name', c.name, 'club_subdomain', c.subdomain,
    'first_name', split_part(trim(coalesce(m.name, '')), ' ', 1),
    'email', lower(trim(coalesce(m.email, ''))), 'expires_at', i.expires_at);
END $$;
GRANT EXECUTE ON FUNCTION public.resolve_member_activation(text) TO anon, authenticated;

-- Signed-in: claim the existing membership. The login's confirmed email must match the club's email.
CREATE OR REPLACE FUNCTION public.claim_member_activation(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE i record; m record; v_uid uuid := auth.uid(); v_email text; v_confirmed timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('status', 'not_signed_in'); END IF;
  SELECT * INTO i FROM public.member_activation_invites WHERE token_hash = encode(extensions.digest(coalesce(_token, ''), 'sha256'), 'hex') FOR UPDATE;
  IF i.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT id, email, user_id INTO m FROM public.club_members WHERE id = i.club_member_id FOR UPDATE;
  IF m.user_id = v_uid THEN
    UPDATE public.member_activation_invites SET used_at = coalesce(used_at, now()), used_by = coalesce(used_by, v_uid) WHERE id = i.id;
    UPDATE public.member_activation_invites SET revoked_at = now() WHERE club_member_id = m.id AND used_at IS NULL AND revoked_at IS NULL;
    RETURN jsonb_build_object('status', 'claimed', 'club_member_id', m.id);
  END IF;
  IF m.user_id IS NOT NULL OR i.used_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'already_claimed'); END IF;
  IF i.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'revoked'); END IF;
  IF i.expires_at < now() THEN RETURN jsonb_build_object('status', 'expired'); END IF;
  SELECT email, email_confirmed_at INTO v_email, v_confirmed FROM auth.users WHERE id = v_uid;
  IF v_confirmed IS NULL OR lower(trim(coalesce(v_email, ''))) <> lower(trim(coalesce(m.email, ''))) THEN
    RETURN jsonb_build_object('status', 'email_mismatch');
  END IF;
  UPDATE public.club_members SET user_id = v_uid, updated_at = now() WHERE id = m.id AND user_id IS NULL;
  UPDATE public.member_activation_invites SET used_at = now(), used_by = v_uid WHERE id = i.id;
  UPDATE public.member_activation_invites SET revoked_at = now() WHERE club_member_id = m.id AND used_at IS NULL AND revoked_at IS NULL;
  RETURN jsonb_build_object('status', 'claimed', 'club_member_id', m.id);
END $$;
REVOKE ALL ON FUNCTION public.claim_member_activation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_member_activation(text) TO authenticated;

-- Standard onboarding template (all clubs, current + future).
CREATE OR REPLACE FUNCTION public.welcome_template_email_body()
RETURNS text LANGUAGE sql IMMUTABLE AS $f$
SELECT '<p>Dear {{first_name}} {{surname}},</p><h2>Activate your SquashHub account</h2><p>{{club_name}} is now using SquashHub. Your existing membership has already been loaded, so you do not need to register as a new member.</p><p>Click the button below to use your unique personal registration link. This link is for you only and should not be shared.</p><p><a href="{{action_url}}" style="display:inline-block;background:#1E3A5F;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px">{{action_label}}</a></p><p>If you use Google with this email address, you can choose Continue with Google and won''t need to create a separate password.</p><p>Once you are in, please check that your details (name, cell number, email address and identity number) are complete and correct.</p><p>Need a hand getting started? <a href="https://www.youtube.com/shorts/knRz2-Xik24?feature=share">Watch the SquashHub registration and login video</a>.</p>'::text
$f$;

CREATE OR REPLACE FUNCTION public.seed_club_welcome_template(p_club_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_club_id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM public.comms_templates WHERE club_id = p_club_id AND name = 'Welcome to SquashHub' LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.comms_templates (club_id, name, category, action)
  VALUES (p_club_id, 'Welcome to SquashHub', 'general',
          jsonb_build_object('key', 'register_existing_member', 'label', 'Activate my SquashHub account'))
  RETURNING id INTO v_id;
  INSERT INTO public.comms_template_versions (template_id, channel, subject, body) VALUES
  (v_id, 'email', 'Activate your SquashHub account - {{club_name}}', public.welcome_template_email_body()),
  (v_id, 'whatsapp', '', E'Dear {{first_name}} {{surname}}, {{club_name}} is now using SquashHub. Your existing membership has already been loaded, so you do not need to register as a new member.\n\nActivate your SquashHub account with your unique personal link (for you only, please do not share or forward it): {{action_url}}\n\nIf you use Google with this email address, you can choose Continue with Google and won''t need a separate password.'),
  (v_id, 'sms', '', '{{club_name}} is now on SquashHub. Activate your account with your personal link (do not share): {{action_url}}'),
  (v_id, 'in_app', 'Welcome to SquashHub', 'Dear {{first_name}} {{surname}}, {{club_name}} is now on SquashHub. Please check that your details are complete and correct.');
  RETURN v_id;
END $$;

UPDATE public.comms_templates
SET action = jsonb_build_object('key', 'register_existing_member', 'label', 'Activate my SquashHub account')
WHERE name = 'Welcome to SquashHub' AND coalesce(action->>'key', '') = 'register_existing_member';

UPDATE public.comms_template_versions v
SET subject = 'Activate your SquashHub account - {{club_name}}', body = public.welcome_template_email_body()
FROM public.comms_templates t
WHERE v.template_id = t.id AND t.name = 'Welcome to SquashHub' AND v.channel = 'email'
  AND v.subject = '{{club_name}} has joined SquashHub - please register your membership';

UPDATE public.comms_template_versions v
SET body = E'Dear {{first_name}} {{surname}}, {{club_name}} is now using SquashHub. Your existing membership has already been loaded, so you do not need to register as a new member.\n\nActivate your SquashHub account with your unique personal link (for you only, please do not share or forward it): {{action_url}}\n\nIf you use Google with this email address, you can choose Continue with Google and won''t need a separate password.'
FROM public.comms_templates t
WHERE v.template_id = t.id AND t.name = 'Welcome to SquashHub' AND v.channel = 'whatsapp'
  AND v.body LIKE '%Please register as an existing member (not a new member) here: {{action_url}}%';

UPDATE public.comms_template_versions v
SET body = '{{club_name}} is now on SquashHub. Activate your account with your personal link (do not share): {{action_url}}'
FROM public.comms_templates t
WHERE v.template_id = t.id AND t.name = 'Welcome to SquashHub' AND v.channel = 'sms'
  AND v.body LIKE '%Please register as an existing member and check your details are complete: {{action_url}}%';