CREATE OR REPLACE FUNCTION public.register_doubles_pair(_champ_id uuid, _member_id uuid, _partner_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c record;
  m record;
  p record;
  v_status text;
  v_my_reg record;
  v_partner_reg record;
BEGIN
  IF _member_id = _partner_member_id THEN
    RAISE EXCEPTION 'You cannot pick yourself as a partner';
  END IF;

  SELECT * INTO c FROM public.club_champs WHERE id = _champ_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF COALESCE(c.match_type, '') <> 'doubles' THEN
    RAISE EXCEPTION 'This tournament is not a doubles event';
  END IF;

  SELECT * INTO m FROM public.club_members WHERE id = _member_id;
  IF m.id IS NULL OR m.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only register your own membership';
  END IF;

  SELECT * INTO p FROM public.club_members WHERE id = _partner_member_id;
  IF p.id IS NULL OR p.club_id <> c.club_id OR m.club_id <> c.club_id THEN
    RAISE EXCEPTION 'Partner must be a member of this club';
  END IF;

  IF NOT public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs') THEN
    IF c.entries_locked THEN RAISE EXCEPTION 'Entries are locked for this tournament'; END IF;
    IF c.registration_opens_at IS NOT NULL AND now() < c.registration_opens_at THEN
      RAISE EXCEPTION 'Registration has not opened yet';
    END IF;
    IF c.registration_closes_at IS NOT NULL AND now() > c.registration_closes_at THEN
      RAISE EXCEPTION 'Registration is closed';
    END IF;
  END IF;

  IF c.gender = 'men' AND lower(COALESCE(p.gender, '')) NOT IN ('men', 'male', 'm') THEN
    RAISE EXCEPTION 'This is a men''s event — please pick a male partner';
  END IF;
  IF c.gender = 'ladies' AND lower(COALESCE(p.gender, '')) NOT IN ('ladies', 'female', 'f', 'women') THEN
    RAISE EXCEPTION 'This is a ladies'' event — please pick a female partner';
  END IF;

  -- partner must not already be paired with anyone
  IF EXISTS (
    SELECT 1 FROM public.club_champs_registrations r
    WHERE r.champ_id = _champ_id
      AND COALESCE(r.status, '') <> 'cancelled'
      AND (
        (r.club_member_id = _partner_member_id AND r.partner_member_id IS NOT NULL)
        OR (r.partner_member_id = _partner_member_id AND r.club_member_id <> _member_id)
      )
  ) THEN
    RAISE EXCEPTION 'That member already has a partner for this tournament';
  END IF;

  v_status := CASE
    WHEN COALESCE(c.payment_required, false) AND COALESCE(c.entry_fee_cents, 0) > 0
      THEN 'pending_payment' ELSE 'paid' END;

  -- my registration
  SELECT * INTO v_my_reg FROM public.club_champs_registrations
   WHERE champ_id = _champ_id AND club_member_id = _member_id LIMIT 1;

  IF v_my_reg.id IS NULL THEN
    INSERT INTO public.club_champs_registrations (champ_id, club_member_id, status, partner_member_id, partner_confirmed)
    VALUES (_champ_id, _member_id, v_status, _partner_member_id, true)
    RETURNING * INTO v_my_reg;
  ELSE
    IF v_my_reg.partner_member_id IS NOT NULL AND v_my_reg.partner_member_id <> _partner_member_id THEN
      RAISE EXCEPTION 'You already have a partner for this tournament';
    END IF;
    UPDATE public.club_champs_registrations
       SET partner_member_id = _partner_member_id,
           partner_confirmed = true,
           status = CASE WHEN COALESCE(status, '') = 'cancelled' THEN v_status ELSE status END
     WHERE id = v_my_reg.id
     RETURNING * INTO v_my_reg;
  END IF;

  -- partner registration (created on their behalf if missing)
  SELECT * INTO v_partner_reg FROM public.club_champs_registrations
   WHERE champ_id = _champ_id AND club_member_id = _partner_member_id LIMIT 1;

  IF v_partner_reg.id IS NULL THEN
    INSERT INTO public.club_champs_registrations (champ_id, club_member_id, status, partner_member_id, partner_confirmed)
    VALUES (_champ_id, _partner_member_id, v_status, _member_id, true)
    RETURNING * INTO v_partner_reg;
  ELSE
    UPDATE public.club_champs_registrations
       SET partner_member_id = _member_id,
           partner_confirmed = true,
           status = CASE WHEN COALESCE(status, '') = 'cancelled' THEN v_status ELSE status END
     WHERE id = v_partner_reg.id
     RETURNING * INTO v_partner_reg;
  END IF;

  RETURN jsonb_build_object(
    'registration_id', v_my_reg.id,
    'partner_registration_id', v_partner_reg.id,
    'partner_status', v_partner_reg.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_doubles_pair(uuid, uuid, uuid) TO authenticated;