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
  v_fee int;
  v_group int;
  v_pair record;
  v_pair_id uuid;
  v_pair_status text;
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

  IF EXISTS (
    SELECT 1 FROM public.club_champs_registrations r
    WHERE r.champ_id = _champ_id
      AND COALESCE(r.status, '') <> 'cancelled'
      AND (
        (r.club_member_id = _partner_member_id AND r.partner_member_id IS NOT NULL
         AND r.partner_member_id <> _member_id)
        OR (r.partner_member_id = _partner_member_id AND r.club_member_id <> _member_id)
      )
  ) THEN
    RAISE EXCEPTION 'That member already has a partner for this tournament';
  END IF;

  v_fee := COALESCE(public.champ_entry_fee_cents(_champ_id), 0);
  v_status := CASE WHEN v_fee > 0 THEN 'pending_payment' ELSE 'paid' END;

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
           -- no fee due: entering a pair is a full acceptance
           status = CASE
             WHEN v_fee = 0 AND lower(COALESCE(status, '')) IN ('', 'invited', 'cancelled', 'pending', 'pending_payment')
               THEN 'paid'
             WHEN COALESCE(status, '') = 'cancelled' THEN v_status
             ELSE status END,
           confirmed_at = COALESCE(confirmed_at, now()),
           confirmation_source = COALESCE(confirmation_source, 'rsvp')
     WHERE id = v_my_reg.id
     RETURNING * INTO v_my_reg;
  END IF;

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
           status = CASE
             WHEN v_fee = 0 AND lower(COALESCE(status, '')) IN ('', 'invited', 'cancelled', 'pending', 'pending_payment')
               THEN 'paid'
             WHEN COALESCE(status, '') = 'cancelled' THEN v_status
             ELSE status END,
           confirmed_at = COALESCE(confirmed_at, now()),
           confirmation_source = COALESCE(confirmation_source, 'rsvp')
     WHERE id = v_partner_reg.id
     RETURNING * INTO v_partner_reg;
  END IF;

  -- Always create the formal doubles pair so the pairing engine owns the state.
  v_group := COALESCE(
    (SELECT dc FROM unnest(COALESCE(v_my_reg.division_choices, '{}'::int[])) dc LIMIT 1),
    (SELECT dc FROM unnest(COALESCE(v_partner_reg.division_choices, '{}'::int[])) dc LIMIT 1),
    (SELECT MIN(r.group_number) FROM public.club_champs_rounds r WHERE r.champ_id = _champ_id),
    1
  );

  SELECT * INTO v_pair FROM public.champ_doubles_pairs pr
   WHERE pr.champ_id = _champ_id
     AND pr.group_number = v_group
     AND pr.status IN ('pending', 'awaiting_payment', 'confirmed')
     AND ((pr.member_a = _member_id AND pr.member_b = _partner_member_id)
       OR (pr.member_a = _partner_member_id AND pr.member_b = _member_id))
   LIMIT 1;

  IF v_pair.id IS NULL THEN
    INSERT INTO public.champ_doubles_pairs (champ_id, group_number, member_a, member_b, proposed_by,
                                            status, accepted_at, responded_at, responded_by, origin)
    VALUES (_champ_id, v_group, _member_id, _partner_member_id, _member_id,
            'awaiting_payment', now(), now(), _member_id, 'player')
    RETURNING id INTO v_pair_id;
  ELSE
    v_pair_id := v_pair.id;
    UPDATE public.champ_doubles_pairs
       SET accepted_at = COALESCE(accepted_at, now()),
           responded_at = COALESCE(responded_at, now()),
           status = CASE WHEN status = 'pending' THEN 'awaiting_payment' ELSE status END
     WHERE id = v_pair_id;
  END IF;

  v_pair_status := public.champ_pair_settle(v_pair_id);

  RETURN jsonb_build_object(
    'registration_id', v_my_reg.id,
    'partner_registration_id', v_partner_reg.id,
    'partner_status', v_partner_reg.status,
    'pair_id', v_pair_id,
    'pair_status', v_pair_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_doubles_pair(uuid, uuid, uuid) TO authenticated;

-- Backfill: confirmed registrations + pair for existing partner choices on fee-free tournaments
DO $do$
DECLARE r record; v_group int; v_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (LEAST(reg.club_member_id, reg.partner_member_id), GREATEST(reg.club_member_id, reg.partner_member_id), reg.champ_id)
           reg.champ_id, reg.club_member_id AS a, reg.partner_member_id AS b, reg.division_choices
      FROM public.club_champs_registrations reg
     WHERE reg.partner_member_id IS NOT NULL
       AND COALESCE(reg.partner_confirmed, false)
       AND lower(COALESCE(reg.status,'')) NOT IN ('cancelled','declined','withdrawn')
       AND COALESCE(public.champ_entry_fee_cents(reg.champ_id), 0) = 0
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.champ_doubles_pairs p
       WHERE p.champ_id = r.champ_id
         AND p.status IN ('pending','awaiting_payment','confirmed')
         AND ((p.member_a = r.a AND p.member_b = r.b) OR (p.member_a = r.b AND p.member_b = r.a))
    ) THEN CONTINUE; END IF;

    v_group := COALESCE(
      (SELECT dc FROM unnest(COALESCE(r.division_choices, '{}'::int[])) dc LIMIT 1),
      (SELECT MIN(rd.group_number) FROM public.club_champs_rounds rd WHERE rd.champ_id = r.champ_id),
      1);

    UPDATE public.club_champs_registrations
       SET status = 'paid',
           division_choices = CASE WHEN COALESCE(array_length(division_choices, 1), 0) = 0
                                   THEN ARRAY[v_group] ELSE division_choices END,
           confirmed_at = COALESCE(confirmed_at, now()),
           confirmation_source = COALESCE(confirmation_source, 'rsvp')
     WHERE champ_id = r.champ_id AND club_member_id IN (r.a, r.b)
       AND lower(COALESCE(status,'')) IN ('', 'invited', 'pending', 'pending_payment');

    INSERT INTO public.champ_doubles_pairs (champ_id, group_number, member_a, member_b, proposed_by,
                                            status, accepted_at, responded_at, responded_by, origin)
    VALUES (r.champ_id, v_group, r.a, r.b, r.a, 'awaiting_payment', now(), now(), r.a, 'player')
    RETURNING id INTO v_id;

    PERFORM public.champ_pair_settle(v_id);
  END LOOP;
END $do$;