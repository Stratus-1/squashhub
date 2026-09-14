ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS paid_by_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_champ_regs_paid_by
  ON public.club_champs_registrations (champ_id, paid_by_member_id);

-- Enter (and optionally pair) other players on behalf of a paying member.
CREATE OR REPLACE FUNCTION public.register_players_for_champ(
  p_champ_id uuid,
  p_payer_member_id uuid,
  p_entries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  payer record;
  e jsonb;
  v_member uuid;
  v_partner uuid;
  m record;
  p record;
  v_fee int;
  v_status text;
  v_reg record;
  v_ids uuid[] := '{}';
  v_is_admin boolean;
BEGIN
  SELECT * INTO c FROM public.club_champs WHERE id = p_champ_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Tournament not found'; END IF;

  SELECT * INTO payer FROM public.club_members WHERE id = p_payer_member_id;
  IF payer.id IS NULL THEN RAISE EXCEPTION 'Paying member not found'; END IF;

  IF payer.user_id IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.member_account_delegations d
       WHERE d.member_id = p_payer_member_id
         AND d.status = 'accepted'
         AND d.delegate_member_id IN (SELECT id FROM public.club_members WHERE user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'You can only pay from your own member account';
    END IF;
  END IF;

  v_is_admin := public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs');
  IF NOT v_is_admin THEN
    IF c.entries_locked THEN RAISE EXCEPTION 'Entries are locked for this tournament'; END IF;
    IF c.registration_opens_at IS NOT NULL AND now() < c.registration_opens_at THEN
      RAISE EXCEPTION 'Registration has not opened yet';
    END IF;
    IF c.registration_closes_at IS NOT NULL AND now() > c.registration_closes_at THEN
      RAISE EXCEPTION 'Registration is closed';
    END IF;
  END IF;

  v_fee := COALESCE(public.champ_entry_fee_cents(p_champ_id), COALESCE(c.entry_fee_cents, 0));
  v_status := CASE WHEN v_fee > 0 THEN 'pending_payment' ELSE 'paid' END;

  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_entries, '[]'::jsonb))
  LOOP
    v_member := NULLIF(e->>'member_id', '')::uuid;
    v_partner := NULLIF(e->>'partner_member_id', '')::uuid;
    CONTINUE WHEN v_member IS NULL;

    SELECT * INTO m FROM public.club_members WHERE id = v_member;
    IF m.id IS NULL THEN RAISE EXCEPTION 'Player not found'; END IF;

    IF v_partner IS NOT NULL THEN
      IF v_partner = v_member THEN RAISE EXCEPTION 'A player cannot partner themselves'; END IF;
      SELECT * INTO p FROM public.club_members WHERE id = v_partner;
      IF p.id IS NULL THEN RAISE EXCEPTION 'Partner not found'; END IF;
      IF EXISTS (
        SELECT 1 FROM public.club_champs_registrations r
         WHERE r.champ_id = p_champ_id
           AND COALESCE(r.status, '') <> 'cancelled'
           AND ((r.club_member_id = v_partner AND r.partner_member_id IS NOT NULL AND r.partner_member_id <> v_member)
             OR (r.partner_member_id = v_partner AND r.club_member_id <> v_member))
      ) THEN
        RAISE EXCEPTION 'That partner is already paired with someone else';
      END IF;
    END IF;

    SELECT * INTO v_reg FROM public.club_champs_registrations
     WHERE champ_id = p_champ_id AND club_member_id = v_member LIMIT 1;

    IF v_reg.id IS NULL THEN
      INSERT INTO public.club_champs_registrations
        (champ_id, club_member_id, status, partner_member_id, partner_confirmed, paid_by_member_id)
      VALUES (p_champ_id, v_member, v_status, v_partner, v_partner IS NOT NULL, p_payer_member_id)
      RETURNING * INTO v_reg;
    ELSE
      UPDATE public.club_champs_registrations
         SET partner_member_id = COALESCE(v_partner, partner_member_id),
             partner_confirmed = CASE WHEN v_partner IS NOT NULL THEN true ELSE partner_confirmed END,
             paid_by_member_id = CASE
               WHEN lower(COALESCE(status, '')) IN ('paid', 'waived') THEN paid_by_member_id
               ELSE p_payer_member_id END,
             status = CASE
               WHEN lower(COALESCE(status, '')) IN ('paid', 'waived') THEN status
               ELSE v_status END,
             confirmed_at = COALESCE(confirmed_at, now()),
             confirmation_source = COALESCE(confirmation_source, 'paid_by_member')
       WHERE id = v_reg.id
       RETURNING * INTO v_reg;
    END IF;

    v_ids := v_ids || v_reg.id;

    IF m.user_id IS NOT NULL AND m.user_id <> COALESCE(payer.user_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (m.user_id,
              'You have been entered into ' || COALESCE(c.name, 'a tournament'),
              COALESCE(payer.name, 'A club member') || ' entered you into ' || COALESCE(c.name, 'a tournament')
                || CASE WHEN v_fee > 0 THEN ' and is settling your entry fee.' ELSE '.' END,
              'tournament');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('registration_ids', to_jsonb(v_ids), 'entry_fee_cents', v_fee);
END;
$$;

REVOKE ALL ON FUNCTION public.register_players_for_champ(uuid, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.register_players_for_champ(uuid, uuid, jsonb) TO authenticated;

-- Raise one entry-fee line per entered player against the paying member's account.
CREATE OR REPLACE FUNCTION public.charge_champ_entries_to_payer(
  p_registration_ids uuid[],
  p_payer_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payer record;
  r record;
  ch record;
  v_amount numeric;
  v_label text;
  v_fee_id uuid;
  v_fee_ids uuid[] := '{}';
  v_total numeric := 0;
BEGIN
  SELECT * INTO payer FROM public.club_members WHERE id = p_payer_member_id;
  IF payer.id IS NULL THEN RAISE EXCEPTION 'Paying member not found'; END IF;

  IF payer.user_id IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.member_account_delegations d
       WHERE d.member_id = p_payer_member_id
         AND d.status = 'accepted'
         AND d.delegate_member_id IN (SELECT id FROM public.club_members WHERE user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'You can only charge your own member account';
    END IF;
  END IF;

  FOR r IN
    SELECT reg.*, cm.name AS player_name
      FROM public.club_champs_registrations reg
      JOIN public.club_members cm ON cm.id = reg.club_member_id
     WHERE reg.id = ANY(p_registration_ids)
       AND COALESCE(reg.paid_by_member_id, reg.club_member_id) = p_payer_member_id
       AND lower(COALESCE(reg.status, '')) IN ('pending_payment', 'pending_eft')
  LOOP
    SELECT * INTO ch FROM public.club_champs WHERE id = r.champ_id;
    CONTINUE WHEN ch.id IS NULL;

    v_amount := COALESCE(public.champ_entry_fee_cents(r.champ_id), COALESCE(ch.entry_fee_cents, 0))::numeric / 100;
    CONTINUE WHEN v_amount <= 0;

    IF r.club_member_id = p_payer_member_id THEN
      v_fee_id := public.ensure_tournament_entry_fee(r.id);
    ELSE
      v_label := COALESCE(ch.name, 'Tournament') || ' entry fee — ' || COALESCE(r.player_name, 'player');
      INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
      VALUES (p_payer_member_id, 'tournament_entry', v_label, v_amount, false,
              EXTRACT(YEAR FROM COALESCE(ch.start_date, now()))::int)
      ON CONFLICT (club_member_id, fee_type, fee_label, season_year)
      DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()
      RETURNING id INTO v_fee_id;

      UPDATE public.club_champs_registrations
         SET fee_payment_id = COALESCE(fee_payment_id, v_fee_id)
       WHERE id = r.id;
    END IF;

    IF v_fee_id IS NOT NULL THEN
      v_fee_ids := v_fee_ids || v_fee_id;
      v_total := v_total + v_amount;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('fee_ids', to_jsonb(v_fee_ids), 'total', v_total, 'count', COALESCE(array_length(v_fee_ids, 1), 0));
END;
$$;

REVOKE ALL ON FUNCTION public.charge_champ_entries_to_payer(uuid[], uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.charge_champ_entries_to_payer(uuid[], uuid) TO authenticated;

-- When a linked entry fee is settled, mark the matching tournament entries paid.
CREATE OR REPLACE FUNCTION public.tg_fee_paid_marks_champ_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.paid, false) AND NOT COALESCE(OLD.paid, false) THEN
    UPDATE public.club_champs_registrations
       SET status = 'paid',
           confirmed_at = COALESCE(confirmed_at, now())
     WHERE fee_payment_id = NEW.id
       AND lower(COALESCE(status, '')) IN ('pending_payment', 'pending_eft');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fee_paid_marks_champ_entries ON public.club_member_fee_payments;
CREATE TRIGGER trg_fee_paid_marks_champ_entries
AFTER UPDATE OF paid ON public.club_member_fee_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_fee_paid_marks_champ_entries();