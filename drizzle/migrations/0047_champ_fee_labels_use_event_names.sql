-- Use the real event/category name (tournaments.group_labels) in tournament entry-fee
-- labels instead of "(event N)".

CREATE OR REPLACE FUNCTION public.champ_group_label(p_champ_id uuid, p_group int)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    NULLIF(trim((SELECT t.group_labels ->> p_group::text FROM public.tournaments t WHERE t.id = p_champ_id)), ''),
    'event ' || p_group::text
  );
$$;

GRANT EXECUTE ON FUNCTION public.champ_group_label(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.champ_group_label(uuid, int) TO service_role;

DROP FUNCTION IF EXISTS public.step_charge_pair_to_account(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.invite_settle_entry(text, text, text);

-- step_charge_pair_to_account: partner fee label uses the event name.
CREATE FUNCTION public.step_charge_pair_to_account(p_registration_id uuid, p_token text, p_verify text, p_scope text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx jsonb; v_champ record; v_partner record; v_mine record; v_payer uuid; v_bill uuid;
  v_amount numeric; v_fee_id uuid; v_pname text; v_group int; v_my numeric := 0;
BEGIN
  IF p_scope NOT IN ('partner','both') THEN RAISE EXCEPTION 'Invalid payment choice'; END IF;
  v_ctx := public.step_pair_payment_context(p_registration_id, p_token, p_verify, NULL, p_scope);
  IF NOT coalesce((v_ctx->>'ok')::boolean, false) THEN RETURN v_ctx; END IF;
  IF NOT coalesce((v_ctx->>'account_allowed')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Member-account payment is not enabled for this tournament');
  END IF;
  SELECT * INTO v_partner FROM public.club_champs_registrations WHERE id = (v_ctx->>'partner_registration_id')::uuid FOR UPDATE;
  SELECT * INTO v_mine FROM public.club_champs_registrations WHERE id = (v_ctx->>'my_registration_id')::uuid FOR UPDATE;
  v_group := coalesce((v_ctx->>'partner_group')::int, public.champ_shared_group(v_partner.id, v_mine.club_member_id));
  IF public.champ_member_event_paid(v_partner.champ_id, v_partner.club_member_id, v_group) THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'Your partner''s entry fee is already settled');
  END IF;
  IF v_partner.fee_payment_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.club_member_fee_payments f WHERE f.id = v_partner.fee_payment_id AND f.invoice_issued_at IS NOT NULL AND NOT f.paid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Your partner has already been invoiced for this fee — pay it by card instead, or ask the club');
  END IF;
  SELECT c.id, c.name, c.club_id, c.start_date INTO v_champ FROM public.club_champs c WHERE c.id = v_partner.champ_id;
  v_payer := v_mine.club_member_id;
  v_bill := public.resolve_host_billing_member(v_payer, v_champ.club_id);
  v_amount := coalesce(public.champ_entry_fee_cents(v_partner.champ_id), 0)::numeric / 100;
  SELECT name INTO v_pname FROM public.club_members WHERE id = v_partner.club_member_id;
  INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
  VALUES (v_bill, 'tournament_entry', coalesce(v_champ.name,'Tournament') || ' entry fee – for ' || coalesce(v_pname,'partner')
          || CASE WHEN v_group > 0 THEN ' (' || public.champ_group_label(v_champ.id, v_group) || ')' ELSE '' END,
          v_amount, false, EXTRACT(YEAR FROM coalesce(v_champ.start_date, now()))::int)
  ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_fee_id;
  PERFORM public.champ_mark_event_cover(v_partner.id, v_group, v_payer, 'account', NULL);
  IF p_scope = 'both' AND v_mine.fee_settled_via IS NULL AND NOT public.champ_member_fee_settled(v_mine.champ_id, v_payer) THEN
    v_my := coalesce(public.champ_reg_own_due_cents(v_mine.id), 0)::numeric / 100;
    PERFORM public.ensure_tournament_entry_fee(v_mine.id);
    UPDATE public.club_champs_registrations SET fee_settled_via = 'account', fee_settled_via_at = now()
     WHERE id = v_mine.id AND fee_settled_via IS NULL;
  END IF;
  RETURN jsonb_build_object('ok', true, 'charged', true, 'scope', p_scope,
    'amount', v_amount + v_my, 'partner_name', v_ctx->>'partner_name');
END
$function$;

-- invite_settle_entry: partner fee label uses the event name.
CREATE FUNCTION public.invite_settle_entry(p_token text, p_verify text, p_method text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; r record; m record; c record; v_amount int; v_bank record; p record;
        v_partner uuid; v_preg uuid; v_bill uuid; v_pname text; v_fee numeric;
BEGIN
  IF p_method NOT IN ('account','eft','cash') THEN RAISE EXCEPTION 'Choose a payment method'; END IF;
  v_id := public._invite_reg_id(p_token);
  IF v_id IS NULL THEN RAISE EXCEPTION 'This invitation is no longer valid'; END IF;
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = v_id FOR UPDATE;
  SELECT * INTO m FROM public.club_members WHERE id = r.club_member_id;
  IF NOT ((auth.uid() IS NOT NULL AND (m.user_id = auth.uid() OR public.member_is_delegate_of(m.id, auth.uid())))
          OR public.invite_verification_ok(m.id, p_verify)) THEN
    RAISE EXCEPTION 'Please verify this invitation first';
  END IF;
  IF lower(coalesce(r.status,'')) IN ('cancelled','declined','withdrawn','invited') THEN
    RAISE EXCEPTION 'Enter the tournament before paying';
  END IF;
  IF NOT (p_method = ANY(public._champ_payment_methods(r.champ_id))) THEN
    RAISE EXCEPTION 'That payment method is not available for this tournament';
  END IF;
  SELECT id, name, club_id, start_date INTO c FROM public.club_champs WHERE id = r.champ_id;
  v_amount := public._invite_amount_cents(v_id);
  IF v_amount <= 0 THEN RETURN jsonb_build_object('ok', true, 'nothing_due', true); END IF;

  PERFORM public.ensure_tournament_entry_fee(v_id);

  IF p_method = 'account' THEN
    UPDATE public.club_champs_registrations SET fee_settled_via = 'account', fee_settled_via_at = now()
     WHERE id = v_id AND fee_settled_via IS NULL AND paid_at IS NULL;
    -- Partner events this player covers go on the payer's account too.
    FOR p IN SELECT * FROM public.champ_doubles_pairs
              WHERE champ_id = r.champ_id AND pays_for_partner AND payer_member_id = r.club_member_id
                AND status IN ('awaiting_payment','pending') LOOP
      v_partner := CASE WHEN p.member_a = r.club_member_id THEN p.member_b ELSE p.member_a END;
      IF public.champ_member_event_paid(r.champ_id, v_partner, p.group_number) THEN CONTINUE; END IF;
      SELECT id INTO v_preg FROM public.club_champs_registrations
       WHERE champ_id = r.champ_id AND club_member_id = v_partner
         AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn')
       ORDER BY created_at DESC LIMIT 1;
      IF v_preg IS NULL THEN CONTINUE; END IF;
      v_bill := public.resolve_host_billing_member(r.club_member_id, c.club_id);
      v_fee := public.champ_division_fee_cents(r.champ_id, p.group_number)::numeric / 100;
      SELECT name INTO v_pname FROM public.club_members WHERE id = v_partner;
      INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
      VALUES (v_bill, 'tournament_entry', coalesce(c.name,'Tournament') || ' entry fee – for ' || coalesce(v_pname,'partner')
              || ' (' || public.champ_group_label(r.champ_id, p.group_number) || ')', v_fee, false,
              EXTRACT(YEAR FROM coalesce(c.start_date, now()))::int)
      ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO UPDATE SET updated_at = now();
      PERFORM public.champ_mark_event_cover(v_preg, p.group_number, r.club_member_id, 'account', NULL);
      PERFORM public.champ_pair_settle(p.id);
    END LOOP;
    FOR p IN SELECT id FROM public.champ_doubles_pairs WHERE champ_id = r.champ_id
              AND r.club_member_id IN (member_a, member_b) AND status = 'awaiting_payment' LOOP
      PERFORM public.champ_pair_settle(p.id);
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'method', 'account', 'amount_cents', v_amount);
  END IF;

  UPDATE public.club_champs_registrations SET status = CASE WHEN p_method = 'eft' THEN 'pending_eft' ELSE status END
   WHERE id = v_id AND status = 'pending_payment';

  IF p_method = 'eft' THEN
    SELECT s.bank_name, s.bank_account_name, s.bank_account_number, s.bank_branch_code
      INTO v_bank FROM public.club_secrets s WHERE s.club_id = c.club_id LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'method', 'eft', 'amount_cents', v_amount,
      'bank_name', v_bank.bank_name, 'bank_account_name', v_bank.bank_account_name,
      'bank_account_number', v_bank.bank_account_number, 'bank_branch_code', v_bank.bank_branch_code,
      'reference', left(regexp_replace(coalesce(m.name,'Entry'), '\s+', ' ', 'g'), 20) || ' ' || left(coalesce(c.name,''), 10));
  END IF;
  RETURN jsonb_build_object('ok', true, 'method', 'cash', 'amount_cents', v_amount);
END
$function$;

-- Fix existing "(event N)" labels on fee rows.
WITH fixed AS (
  SELECT f.id,
         replace(f.fee_label, '(event ' || p.grp || ')', '(' || public.champ_group_label(r.champ_id, p.grp) || ')') AS new_label
  FROM public.club_member_fee_payments f
  JOIN public.club_champs_registrations r ON r.club_member_id = f.club_member_id
  CROSS JOIN LATERAL (SELECT (substring(f.fee_label from '\(event (\d+)\)'))::int AS grp) p
  WHERE f.fee_type = 'tournament_entry' AND f.fee_label ~ '\(event \d+\)'
    AND r.champ_id IN (SELECT id FROM public.club_champs WHERE f.fee_label LIKE name || ' entry fee%')
)
UPDATE public.club_member_fee_payments f SET fee_label = fixed.new_label
FROM fixed WHERE f.id = fixed.id AND fixed.new_label IS NOT NULL;

-- Fix the matching journal descriptions for the 6th test charge.
UPDATE public.club_journal_entries j
SET description = replace(j.description, '(event 3)', '(Mixed Doubles · Doubles)')
WHERE j.description LIKE 'Fee raised: 6th test entry fee%(event 3)%';