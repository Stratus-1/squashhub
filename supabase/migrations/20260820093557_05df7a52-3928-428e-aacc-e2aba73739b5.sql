ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS invite_token_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS club_champs_registrations_invite_token_key
  ON public.club_champs_registrations (invite_token)
  WHERE invite_token IS NOT NULL;

-- 256-bit URL-safe token, no extensions required
CREATE OR REPLACE FUNCTION public.new_invite_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path TO 'public'
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- Organiser: mint tokens for every invitee that does not have one yet.
CREATE OR REPLACE FUNCTION public.ensure_tournament_invite_tokens(p_champ_id uuid)
RETURNS TABLE (registration_id uuid, club_member_id uuid, invite_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.can_manage_tournament(p_champ_id) THEN
    RAISE EXCEPTION 'Not authorised to manage this tournament';
  END IF;

  UPDATE public.club_champs_registrations r
     SET invite_token = public.new_invite_token(),
         invite_token_created_at = now()
   WHERE r.champ_id = p_champ_id
     AND r.invite_token IS NULL;

  RETURN QUERY
    SELECT r.id, r.club_member_id, r.invite_token
      FROM public.club_champs_registrations r
     WHERE r.champ_id = p_champ_id
       AND r.invite_token IS NOT NULL
       AND r.invite_revoked_at IS NULL;
END;
$$;

-- Public landing page payload. Safe for anonymous callers: no member ids,
-- no contact details, only a masked display name so the invitee recognises
-- their own invite.
CREATE OR REPLACE FUNCTION public.get_tournament_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reg record;
  v_champ record;
  v_club record;
  v_member record;
  v_group int;
  v_label text;
  v_name text;
  v_closed boolean := false;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_reg
    FROM public.club_champs_registrations
   WHERE invite_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT id, name, subdomain INTO v_club FROM public.clubs WHERE id = v_champ.club_id;
  SELECT id, name, user_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;

  SELECT e.group_number INTO v_group
    FROM public.club_champs_entries e
   WHERE e.champ_id = v_reg.champ_id AND e.club_member_id = v_reg.club_member_id
   LIMIT 1;

  IF v_group IS NOT NULL THEN
    v_label := COALESCE(
      NULLIF((v_champ.group_labels)[v_group], ''),
      'Division ' || v_group::text
    );
  END IF;

  -- Masked display name: first name + surname initial.
  v_name := NULLIF(trim(COALESCE(v_member.name, '')), '');
  IF v_name IS NOT NULL AND position(' ' IN v_name) > 0 THEN
    v_name := split_part(v_name, ' ', 1) || ' ' || upper(left(split_part(v_name, ' ', 2), 1)) || '.';
  END IF;

  IF v_champ.registration_closes_at IS NOT NULL AND now() > v_champ.registration_closes_at THEN
    v_closed := true;
  END IF;

  -- First view timestamp (lifecycle: viewed)
  IF v_reg.invite_viewed_at IS NULL THEN
    UPDATE public.club_champs_registrations
       SET invite_viewed_at = now()
     WHERE id = v_reg.id;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'champ_id', v_champ.id,
    'tournament_name', v_champ.name,
    'description', v_champ.description,
    'start_date', v_champ.start_date,
    'end_date', v_champ.end_date,
    'registration_closes_at', v_champ.registration_closes_at,
    'registration_opens_at', v_champ.registration_opens_at,
    'entry_fee_cents', COALESCE(v_champ.entry_fee_cents, 0),
    'payment_required', COALESCE(v_champ.payment_required, false),
    'gender', v_champ.gender,
    'match_type', v_champ.match_type,
    'club_name', v_club.name,
    'club_subdomain', v_club.subdomain,
    'division_label', v_label,
    'invitee_name', v_name,
    'status', v_reg.status,
    'confirmed_at', v_reg.confirmed_at,
    'declined_at', v_reg.declined_at,
    'viewed_at', COALESCE(v_reg.invite_viewed_at, now()),
    'revoked', v_reg.invite_revoked_at IS NOT NULL,
    'registration_closed', v_closed,
    'tournament_status', v_champ.status,
    'requires_login', v_member.user_id IS NULL OR auth.uid() IS NULL OR auth.uid() <> v_member.user_id,
    'is_invitee', auth.uid() IS NOT NULL AND auth.uid() = v_member.user_id
  );
END;
$$;

-- Accept / decline from the public link. Binds the action to the signed-in
-- invitee so a forwarded link cannot register somebody else.
CREATE OR REPLACE FUNCTION public.respond_tournament_invite(p_token text, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reg record;
  v_champ record;
  v_member record;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to respond to this invitation';
  END IF;

  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;

  IF v_reg.invite_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has been withdrawn';
  END IF;

  SELECT id, user_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF v_member.user_id IS NULL OR v_member.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'This invitation belongs to another member';
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;

  -- Accepting is only allowed while the registration window is open;
  -- declining stays available so organisers get an accurate headcount.
  IF p_accept
     AND v_champ.registration_closes_at IS NOT NULL
     AND now() > v_champ.registration_closes_at THEN
    RAISE EXCEPTION 'Entries for this tournament have closed';
  END IF;

  -- Reuse the existing acceptance rules (fee creation, payment status).
  v_result := public.accept_tournament_invite(v_reg.id, p_accept);

  UPDATE public.club_champs_registrations
     SET declined_at = CASE WHEN p_accept THEN NULL ELSE COALESCE(declined_at, now()) END,
         invite_viewed_at = COALESCE(invite_viewed_at, now())
   WHERE id = v_reg.id;

  RETURN v_result || jsonb_build_object('champ_id', v_reg.champ_id, 'registration_id', v_reg.id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_tournament_invite(text) FROM public;
REVOKE ALL ON FUNCTION public.respond_tournament_invite(text, boolean) FROM public;
REVOKE ALL ON FUNCTION public.ensure_tournament_invite_tokens(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_tournament_invite(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_tournament_invite(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_tournament_invite_tokens(uuid) TO authenticated;