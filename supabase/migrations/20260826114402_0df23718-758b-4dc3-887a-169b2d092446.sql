-- ── Doubles pairing: admin pre-selection, pay-for-partner, payment-gated locking ──

ALTER TABLE public.champ_doubles_pairs
  ADD COLUMN IF NOT EXISTS payer_member_id uuid,
  ADD COLUMN IF NOT EXISTS pays_for_partner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'player';

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'public.champ_doubles_pairs'::regclass
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.champ_doubles_pairs DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.champ_doubles_pairs
  ADD CONSTRAINT champ_doubles_pairs_status_chk
  CHECK (status IN ('pending','awaiting_payment','confirmed','rejected','cancelled'));

UPDATE public.champ_doubles_pairs SET accepted_at = COALESCE(accepted_at, responded_at), locked_at = COALESCE(locked_at, responded_at)
 WHERE status = 'confirmed';

-- Fee helpers ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.champ_entry_fee_cents(p_champ_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN COALESCE(g.payment_required, false) THEN GREATEST(COALESCE(g.entry_fee_cents, 0), 0) ELSE 0 END
    FROM public.tournament_governance g WHERE g.tournament_id = p_champ_id;
$$;

CREATE OR REPLACE FUNCTION public.champ_member_fee_paid(p_champ_id uuid, p_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(public.champ_entry_fee_cents(p_champ_id), 0) = 0
      OR EXISTS (
        SELECT 1 FROM public.club_champs_registrations r
         WHERE r.champ_id = p_champ_id AND r.club_member_id = p_member_id
           AND (lower(COALESCE(r.status,'')) IN ('paid','waived')
                OR r.paid_at IS NOT NULL
                OR COALESCE(r.fee_paid_cents, 0) > 0)
      );
$$;

-- Anyone on the invite list (invited or accepted), not withdrawn.
CREATE OR REPLACE FUNCTION public.champ_member_invited(p_champ_id uuid, p_member_id uuid, p_group_number integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_champs_registrations r
     WHERE r.champ_id = p_champ_id
       AND r.club_member_id = p_member_id
       AND lower(COALESCE(r.status,'')) NOT IN ('cancelled','declined','withdrawn')
       AND r.declined_at IS NULL
       AND (p_group_number IS NULL
            OR p_group_number = ANY (COALESCE(r.division_choices, '{}'))
            OR COALESCE(array_length(r.division_choices, 1), 0) = 0)
  );
$$;

-- Settle a pair: confirm+lock only when every required payment is in.
CREATE OR REPLACE FUNCTION public.champ_pair_settle(p_pair_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p record; v_fee int; v_paid_a boolean; v_paid_b boolean; v_next text;
BEGIN
  SELECT * INTO p FROM public.champ_doubles_pairs WHERE id = p_pair_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p.status IN ('rejected','cancelled') THEN RETURN p.status; END IF;
  IF p.accepted_at IS NULL THEN RETURN p.status; END IF;

  v_fee := COALESCE(public.champ_entry_fee_cents(p.champ_id), 0);
  v_paid_a := v_fee = 0 OR public.champ_member_fee_paid(p.champ_id, p.member_a);
  v_paid_b := v_fee = 0 OR public.champ_member_fee_paid(p.champ_id, p.member_b);
  v_next := CASE WHEN v_paid_a AND v_paid_b THEN 'confirmed' ELSE 'awaiting_payment' END;

  UPDATE public.champ_doubles_pairs
     SET status = v_next,
         locked_at = CASE WHEN v_next = 'confirmed' THEN COALESCE(locked_at, now()) ELSE NULL END
   WHERE id = p.id;

  IF v_next = 'confirmed' THEN
    UPDATE public.champ_doubles_pairs
       SET status = 'cancelled', responded_at = now()
     WHERE champ_id = p.champ_id AND group_number = p.group_number AND id <> p.id
       AND status IN ('pending','awaiting_payment')
       AND (member_a IN (p.member_a, p.member_b) OR member_b IN (p.member_a, p.member_b));
    PERFORM public.champ_sync_pair_entries(p.champ_id, p.group_number, p.member_a, p.member_b);
  END IF;

  RETURN v_next;
END $$;

-- When a registration is paid: cover the partner if promised, then re-settle.
CREATE OR REPLACE FUNCTION public.champ_registration_payment_settles_pairs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_fee int; pr record;
BEGIN
  IF NOT public.champ_member_fee_paid(NEW.champ_id, NEW.club_member_id) THEN RETURN NEW; END IF;
  v_fee := COALESCE(public.champ_entry_fee_cents(NEW.champ_id), 0);

  IF v_fee > 0 THEN
    FOR pr IN
      SELECT * FROM public.champ_doubles_pairs
       WHERE champ_id = NEW.champ_id
         AND status IN ('pending','awaiting_payment')
         AND pays_for_partner
         AND payer_member_id = NEW.club_member_id
    LOOP
      UPDATE public.club_champs_registrations r
         SET status = 'paid', paid_at = COALESCE(r.paid_at, now()),
             fee_paid_cents = GREATEST(COALESCE(r.fee_paid_cents, 0), v_fee)
       WHERE r.champ_id = pr.champ_id
         AND r.club_member_id = CASE WHEN pr.payer_member_id = pr.member_a THEN pr.member_b ELSE pr.member_a END
         AND NOT public.champ_member_fee_paid(pr.champ_id, CASE WHEN pr.payer_member_id = pr.member_a THEN pr.member_b ELSE pr.member_a END);
    END LOOP;
  END IF;

  FOR pr IN
    SELECT id FROM public.champ_doubles_pairs
     WHERE champ_id = NEW.champ_id
       AND status IN ('pending','awaiting_payment')
       AND NEW.club_member_id IN (member_a, member_b)
  LOOP
    PERFORM public.champ_pair_settle(pr.id);
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS champ_registration_payment_settles_pairs ON public.club_champs_registrations;
CREATE TRIGGER champ_registration_payment_settles_pairs
AFTER INSERT OR UPDATE OF status, paid_at, fee_paid_cents ON public.club_champs_registrations
FOR EACH ROW EXECUTE FUNCTION public.champ_registration_payment_settles_pairs();

-- Partner options: eligible INVITE list only, never the full roster, and never
-- someone who already sits in an active pair for this division.
CREATE OR REPLACE FUNCTION public.list_doubles_partner_options(p_champ_id uuid, p_group_number integer, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_me uuid; v_rows jsonb;
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN RETURN '[]'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x ->> 'display_name'), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
             'member_id', m.id,
             'display_name', m.name,
             'club_id', m.club_id,
             'club_name', c.name,
             'gender', m.gender,
             'ladder_position', m.ladder_position,
             'fee_paid', public.champ_member_fee_paid(p_champ_id, m.id),
             'accepted', r.confirmed_at IS NOT NULL
           ) AS x
      FROM public.club_champs_registrations r
      JOIN public.club_members m ON m.id = r.club_member_id
      LEFT JOIN public.clubs c ON c.id = m.club_id
     WHERE r.champ_id = p_champ_id
       AND m.id <> v_me
       AND lower(COALESCE(r.status, '')) NOT IN ('cancelled','declined','withdrawn')
       AND r.declined_at IS NULL
       AND (p_group_number = ANY (COALESCE(r.division_choices, '{}'))
            OR COALESCE(array_length(r.division_choices, 1), 0) = 0)
       AND (p_search IS NULL OR trim(p_search) = '' OR m.name ILIKE '%' || trim(p_search) || '%')
       AND NOT EXISTS (
         SELECT 1 FROM public.champ_doubles_pairs p
          WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number
            AND p.status IN ('pending','awaiting_payment','confirmed')
            AND m.id IN (p.member_a, p.member_b)
       )
     LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  ) s;
  RETURN v_rows;
END $$;

-- Propose a partner, optionally paying for them.
DROP FUNCTION IF EXISTS public.propose_doubles_partner(uuid, integer, uuid, text, text);
CREATE OR REPLACE FUNCTION public.propose_doubles_partner(p_champ_id uuid, p_group_number integer, p_partner_member_id uuid, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text, p_pay_for_partner boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_me uuid; v_existing record; v_id uuid; v_status text;
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF v_me = p_partner_member_id THEN RAISE EXCEPTION 'You cannot pair with yourself'; END IF;
  IF public.champ_pairing_locked(p_champ_id) THEN
    RAISE EXCEPTION 'Doubles pairs are locked by the organiser';
  END IF;
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN
    RAISE EXCEPTION 'This division is not a doubles division';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_champ_id::text || ':' || p_group_number::text, 0));

  IF NOT public.champ_member_accepted(p_champ_id, v_me, p_group_number) THEN
    RAISE EXCEPTION 'Please complete your own registration for this division first';
  END IF;
  IF NOT public.champ_member_invited(p_champ_id, p_partner_member_id, p_group_number) THEN
    RAISE EXCEPTION 'You can only pick a partner from the invited players for this division.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.champ_doubles_pairs p
     WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number
       AND p.status IN ('awaiting_payment','confirmed')
       AND (p.member_a IN (v_me, p_partner_member_id) OR p.member_b IN (v_me, p_partner_member_id))
  ) THEN
    RAISE EXCEPTION 'One of these players is already paired in this division';
  END IF;

  -- mutual proposal -> treat as accepted, then settle on payment
  SELECT * INTO v_existing FROM public.champ_doubles_pairs p
   WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number AND p.status = 'pending'
     AND p.member_a = p_partner_member_id AND p.member_b = v_me
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.champ_doubles_pairs
       SET responded_at = now(), responded_by = v_me, accepted_at = now(),
           pays_for_partner = pays_for_partner OR COALESCE(p_pay_for_partner, false),
           payer_member_id = CASE WHEN COALESCE(p_pay_for_partner, false) THEN v_me ELSE payer_member_id END
     WHERE id = v_existing.id;
    v_status := public.champ_pair_settle(v_existing.id);
    RETURN jsonb_build_object('id', v_existing.id, 'status', v_status);
  END IF;

  UPDATE public.champ_doubles_pairs
     SET status = 'cancelled', responded_at = now(), responded_by = v_me
   WHERE champ_id = p_champ_id AND group_number = p_group_number AND status = 'pending'
     AND proposed_by = v_me;

  INSERT INTO public.champ_doubles_pairs (champ_id, group_number, member_a, member_b, proposed_by, status,
                                          pays_for_partner, payer_member_id, origin)
  VALUES (p_champ_id, p_group_number, v_me, p_partner_member_id, v_me, 'pending',
          COALESCE(p_pay_for_partner, false),
          CASE WHEN COALESCE(p_pay_for_partner, false) THEN v_me ELSE NULL END, 'player')
  RETURNING id, status INTO v_id, v_status;

  RETURN jsonb_build_object('id', v_id, 'status', v_status);
END $$;

CREATE OR REPLACE FUNCTION public.respond_doubles_pair(p_pair_id uuid, p_accept boolean, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pair record; v_me uuid; v_status text;
BEGIN
  SELECT * INTO v_pair FROM public.champ_doubles_pairs WHERE id = p_pair_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'This pairing no longer exists'; END IF;

  v_me := public.champ_actor_member(v_pair.champ_id, p_token, p_verify);
  IF v_me NOT IN (v_pair.member_a, v_pair.member_b) THEN RAISE EXCEPTION 'This pairing is not yours'; END IF;
  IF v_pair.status NOT IN ('pending','awaiting_payment') THEN
    RETURN jsonb_build_object('id', v_pair.id, 'status', v_pair.status, 'already', true);
  END IF;
  IF v_me = v_pair.proposed_by AND p_accept AND v_pair.status = 'pending' THEN
    RAISE EXCEPTION 'Your partner still has to accept this pairing';
  END IF;
  IF public.champ_pairing_locked(v_pair.champ_id) THEN
    RAISE EXCEPTION 'Doubles pairs are locked by the organiser';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_pair.champ_id::text || ':' || v_pair.group_number::text, 0));

  IF NOT p_accept THEN
    UPDATE public.champ_doubles_pairs
       SET status = CASE WHEN v_me = v_pair.proposed_by THEN 'cancelled' ELSE 'rejected' END,
           responded_at = now(), responded_by = v_me
     WHERE id = v_pair.id;
    RETURN jsonb_build_object('id', v_pair.id, 'status', 'rejected');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.champ_doubles_pairs p
     WHERE p.champ_id = v_pair.champ_id AND p.group_number = v_pair.group_number
       AND p.status = 'confirmed'
       AND (p.member_a IN (v_pair.member_a, v_pair.member_b) OR p.member_b IN (v_pair.member_a, v_pair.member_b))
  ) THEN
    RAISE EXCEPTION 'One of these players is already paired in this division';
  END IF;

  UPDATE public.champ_doubles_pairs
     SET responded_at = now(), responded_by = v_me, accepted_at = COALESCE(accepted_at, now())
   WHERE id = v_pair.id;

  v_status := public.champ_pair_settle(v_pair.id);
  RETURN jsonb_build_object('id', v_pair.id, 'status', v_status);
END $$;

-- Organiser pre-selects a pair.
CREATE OR REPLACE FUNCTION public.admin_pair_doubles_players(p_champ_id uuid, p_group_number integer, p_member_a uuid, p_member_b uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  IF NOT public.can_manage_tournament(p_champ_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_member_a = p_member_b THEN RAISE EXCEPTION 'Pick two different players'; END IF;
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN
    RAISE EXCEPTION 'This division is not a doubles division';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_champ_id::text || ':' || p_group_number::text, 0));

  UPDATE public.champ_doubles_pairs
     SET status = 'cancelled', responded_at = now()
   WHERE champ_id = p_champ_id AND group_number = p_group_number
     AND status IN ('pending','awaiting_payment')
     AND (member_a IN (p_member_a, p_member_b) OR member_b IN (p_member_a, p_member_b));

  IF EXISTS (
    SELECT 1 FROM public.champ_doubles_pairs p
     WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number AND p.status = 'confirmed'
       AND (p.member_a IN (p_member_a, p_member_b) OR p.member_b IN (p_member_a, p_member_b))
  ) THEN
    RAISE EXCEPTION 'One of these players is already paired in this division';
  END IF;

  INSERT INTO public.champ_doubles_pairs (champ_id, group_number, member_a, member_b, proposed_by, status,
                                          accepted_at, origin)
  VALUES (p_champ_id, p_group_number, p_member_a, p_member_b, p_member_a, 'awaiting_payment', now(), 'admin')
  RETURNING id INTO v_id;

  v_status := public.champ_pair_settle(v_id);
  RETURN jsonb_build_object('id', v_id, 'status', v_status);
END $$;

-- Pairing state with payment detail for the "complete registration" screen.
CREATE OR REPLACE FUNCTION public.get_doubles_pairing_state(p_champ_id uuid, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_me uuid; v_rows jsonb; v_fee int;
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  v_fee := COALESCE(public.champ_entry_fee_cents(p_champ_id), 0);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'group_number', p.group_number,
           'status', p.status,
           'origin', p.origin,
           'proposed_by_me', p.proposed_by = v_me,
           'partner_member_id', CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END,
           'partner_name', pm.name,
           'partner_club', pc.name,
           'pays_for_partner', p.pays_for_partner,
           'payer_is_me', p.payer_member_id = v_me,
           'covered_by_partner', p.pays_for_partner AND p.payer_member_id IS DISTINCT FROM v_me,
           'my_fee_paid', public.champ_member_fee_paid(p_champ_id, v_me),
           'partner_fee_paid', public.champ_member_fee_paid(p_champ_id, CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END),
           'locked_at', p.locked_at,
           'created_at', p.created_at,
           'responded_at', p.responded_at
         ) ORDER BY p.group_number, p.created_at), '[]'::jsonb)
    INTO v_rows
    FROM public.champ_doubles_pairs p
    JOIN public.club_members pm ON pm.id = CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END
    LEFT JOIN public.clubs pc ON pc.id = pm.club_id
   WHERE p.champ_id = p_champ_id
     AND v_me IN (p.member_a, p.member_b)
     AND p.status IN ('pending','awaiting_payment','confirmed');

  RETURN jsonb_build_object(
    'member_id', v_me,
    'locked', public.champ_pairing_locked(p_champ_id),
    'entry_fee_cents', v_fee,
    'my_fee_paid', CASE WHEN v_me IS NULL THEN false ELSE public.champ_member_fee_paid(p_champ_id, v_me) END,
    'pairs', v_rows
  );
END $$;

CREATE OR REPLACE FUNCTION public.tournament_doubles_pairs(p_champ_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rows jsonb;
BEGIN
  IF NOT public.can_manage_tournament(p_champ_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'group_number', p.group_number, 'status', p.status, 'origin', p.origin,
           'member_a', p.member_a, 'member_a_name', a.name,
           'member_b', p.member_b, 'member_b_name', b.name,
           'member_a_paid', public.champ_member_fee_paid(p.champ_id, p.member_a),
           'member_b_paid', public.champ_member_fee_paid(p.champ_id, p.member_b),
           'pays_for_partner', p.pays_for_partner, 'payer_member_id', p.payer_member_id,
           'proposed_by', p.proposed_by, 'locked_at', p.locked_at,
           'created_at', p.created_at, 'responded_at', p.responded_at
         ) ORDER BY p.group_number, p.created_at), '[]'::jsonb)
    INTO v_rows
    FROM public.champ_doubles_pairs p
    JOIN public.club_members a ON a.id = p.member_a
    JOIN public.club_members b ON b.id = p.member_b
   WHERE p.champ_id = p_champ_id;
  RETURN jsonb_build_object(
    'locked', public.champ_pairing_locked(p_champ_id),
    'entry_fee_cents', COALESCE(public.champ_entry_fee_cents(p_champ_id), 0),
    'pairs', v_rows);
END $$;