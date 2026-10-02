-- 1. Remember that the member chose to settle the entry fee through their club account.
ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS fee_settled_via text,
  ADD COLUMN IF NOT EXISTS fee_settled_via_at timestamptz;
COMMENT ON COLUMN public.club_champs_registrations.fee_settled_via IS
  'account = entry fee charged to the member club account (owed to the club, not cash received). NULL = not settled that way.';

-- 2. Fee status: account-charged entries are satisfied for entry readiness ("on_account"),
--    but never "paid" (no money received).
CREATE OR REPLACE FUNCTION public.derive_champ_registration_statuses()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_fee integer; s text := lower(coalesce(NEW.status,''));
  v_money boolean; v_fee_ok boolean;
BEGIN
  SELECT coalesce(entry_fee_cents,0) INTO v_fee FROM club_champs WHERE id = NEW.champ_id;
  v_money := NEW.paid_at IS NOT NULL OR coalesce(NEW.fee_paid_cents,0) > 0;
  NEW.fee_status := CASE
    WHEN s = 'waived' THEN 'waived'
    WHEN v_money THEN 'paid'
    WHEN coalesce(v_fee,0) <= 0 THEN 'not_required'
    WHEN s = 'paid' THEN 'paid'
    WHEN NEW.fee_settled_via = 'account' THEN 'on_account'
    WHEN s = 'pending_eft' THEN 'pending'
    ELSE 'due' END;
  v_fee_ok := NEW.fee_status IN ('paid','waived','not_required','on_account');
  IF s IN ('cancelled','declined','withdrawn') THEN
    NEW.registration_status := 'declined';
  ELSIF NEW.registration_source = 'organiser' AND (v_fee_ok OR s IN ('paid','waived')) THEN
    NEW.registration_status := 'registered';
  ELSIF s IN ('paid','waived','registered','active') OR (NEW.confirmed_at IS NOT NULL AND v_fee_ok) THEN
    NEW.registration_status := 'registered';
  ELSE
    NEW.registration_status := 'invited';
  END IF;
  IF NEW.registration_status = 'registered' AND NEW.registration_source IS NULL THEN
    NEW.registration_source := CASE WHEN NEW.confirmed_at IS NOT NULL THEN 'player' ELSE 'organiser' END;
  END IF;
  RETURN NEW;
END $$;

-- 3. "Add R… to my account": reuse the existing fee raise (idempotent), then record the choice once.
CREATE OR REPLACE FUNCTION public.charge_tournament_entry_to_account(p_registration_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_member record;
  v_fee_id uuid;
  v_amount numeric;
  v_paid boolean;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF v_member.user_id IS NULL OR v_member.user_id <> auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.member_account_delegations d
      WHERE d.member_id = v_reg.club_member_id
        AND d.status = 'accepted'
        AND d.delegate_member_id IN (SELECT id FROM public.club_members WHERE user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Not authorised for this registration';
    END IF;
  END IF;

  IF lower(coalesce(v_reg.status,'')) IN ('cancelled','declined','withdrawn') THEN
    RAISE EXCEPTION 'This entry is no longer active';
  END IF;

  v_fee_id := public.ensure_tournament_entry_fee(p_registration_id);
  IF v_fee_id IS NULL THEN
    RETURN jsonb_build_object('charged', false, 'reason', 'no_fee');
  END IF;

  SELECT amount, paid INTO v_amount, v_paid FROM public.club_member_fee_payments WHERE id = v_fee_id;

  IF v_reg.fee_settled_via = 'account' THEN
    RETURN jsonb_build_object('charged', true, 'already', true, 'fee_payment_id', v_fee_id, 'amount', v_amount);
  END IF;

  UPDATE public.club_champs_registrations
     SET fee_settled_via = 'account', fee_settled_via_at = now()
   WHERE id = p_registration_id AND fee_settled_via IS NULL;

  RETURN jsonb_build_object('charged', true, 'already', false, 'fee_payment_id', v_fee_id, 'amount', v_amount, 'fee_paid', coalesce(v_paid,false));
END;
$function$;

-- 4. One source of truth for organiser-picked entrants: sync the active set.
--    Adds new players, updates partner/category of kept players, re-activates re-added players,
--    and withdraws organiser-entered players no longer picked (one-for-one replacement keeps the count).
--    An unpaid entry fee of a withdrawn player is reversed in the ledger (audited), never silently kept.
CREATE OR REPLACE FUNCTION public.step_sync_admin_entrants(p_champ_id uuid, p_entrants jsonb, p_fee_due boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_club uuid;
  e jsonb;
  v_ids uuid[] := '{}';
  v_added int := 0; v_updated int := 0; v_removed int := 0; v_refund int := 0;
  r record;
  v_fee record;
  v_ref uuid;
  v_member uuid;
BEGIN
  IF NOT public.can_manage_tournament(p_champ_id) THEN
    RAISE EXCEPTION 'Not authorised to manage this tournament';
  END IF;
  SELECT club_id INTO v_club FROM public.tournaments WHERE id = p_champ_id;

  FOR e IN SELECT * FROM jsonb_array_elements(coalesce(p_entrants,'[]'::jsonb)) LOOP
    v_member := (e->>'memberId')::uuid;
    v_ids := v_ids || v_member;
    SELECT * INTO r FROM public.club_champs_registrations WHERE champ_id = p_champ_id AND club_member_id = v_member;
    IF NOT FOUND THEN
      INSERT INTO public.club_champs_registrations
        (champ_id, club_member_id, partner_member_id, partner_confirmed, status, invited_by_admin,
         confirmed_at, confirmation_source, registration_source, division_choices)
      VALUES (p_champ_id, v_member, nullif(e->>'partnerId','')::uuid, nullif(e->>'partnerId','') IS NOT NULL,
              CASE WHEN p_fee_due THEN 'pending_payment' ELSE 'invited' END, true,
              now(), 'admin', 'admin', ARRAY[coalesce((e->>'division')::int, 1)]);
      v_added := v_added + 1;
    ELSIF lower(coalesce(r.status,'')) IN ('cancelled','declined','withdrawn') THEN
      UPDATE public.club_champs_registrations
         SET status = CASE WHEN paid_at IS NOT NULL OR coalesce(fee_paid_cents,0) > 0 THEN 'paid'
                           WHEN p_fee_due THEN 'pending_payment' ELSE 'invited' END,
             partner_member_id = nullif(e->>'partnerId','')::uuid,
             partner_confirmed = nullif(e->>'partnerId','') IS NOT NULL,
             division_choices = ARRAY[coalesce((e->>'division')::int, 1)],
             invited_by_admin = true, confirmed_at = now(), confirmation_source = 'admin',
             registration_source = 'admin', declined_at = NULL
       WHERE id = r.id;
      PERFORM public.ensure_tournament_entry_fee(r.id);
      v_added := v_added + 1;
    ELSIF r.partner_member_id IS DISTINCT FROM nullif(e->>'partnerId','')::uuid
       OR r.division_choices IS DISTINCT FROM ARRAY[coalesce((e->>'division')::int, 1)] THEN
      UPDATE public.club_champs_registrations
         SET partner_member_id = nullif(e->>'partnerId','')::uuid,
             partner_confirmed = nullif(e->>'partnerId','') IS NOT NULL,
             division_choices = ARRAY[coalesce((e->>'division')::int, 1)]
       WHERE id = r.id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  -- Organiser-entered players no longer picked: withdraw (history kept).
  FOR r IN
    SELECT * FROM public.club_champs_registrations
     WHERE champ_id = p_champ_id
       AND registration_source = 'admin'
       AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn')
       AND NOT (club_member_id = ANY(v_ids))
  LOOP
    UPDATE public.club_champs_registrations
       SET status = 'cancelled', confirmation_source = 'withdrawn', declined_at = now(),
           partner_member_id = NULL, partner_confirmed = false
     WHERE id = r.id;
    v_removed := v_removed + 1;

    IF r.paid_at IS NOT NULL OR coalesce(r.fee_paid_cents,0) > 0 THEN
      v_refund := v_refund + 1;  -- money received: club refunds manually; nothing financial deleted
    ELSIF r.fee_payment_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.club_champs_registrations o
                       WHERE o.fee_payment_id = r.fee_payment_id AND o.id <> r.id
                         AND lower(coalesce(o.status,'')) NOT IN ('cancelled','declined','withdrawn')) THEN
      SELECT * INTO v_fee FROM public.club_member_fee_payments WHERE id = r.fee_payment_id AND paid = false;
      IF FOUND AND coalesce(v_fee.amount,0) > 0 THEN
        v_ref := gen_random_uuid();
        INSERT INTO public.club_journal_entries
          (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
        VALUES
          (v_club, v_fee.club_member_id, NULL, 'tournament_income', v_fee.amount, 0, 'Tournament entry withdrawn – charge reversed: ' || coalesce(v_fee.fee_label,''), v_ref),
          (v_club, v_fee.club_member_id, NULL, 'debtors', 0, v_fee.amount, 'Tournament entry withdrawn – charge reversed: ' || coalesce(v_fee.fee_label,''), v_ref);
        INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, after_json, note)
        VALUES (v_club, v_ref, 'reverse', auth.uid(),
                jsonb_build_object('registration_id', r.id, 'fee_payment_id', v_fee.id, 'amount', v_fee.amount, 'club_member_id', v_fee.club_member_id),
                'Organiser replaced/removed tournament entrant');
        UPDATE public.club_champs_registrations SET fee_payment_id = NULL WHERE id = r.id;
        DELETE FROM public.club_member_fee_payments WHERE id = v_fee.id AND paid = false;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('added', v_added, 'updated', v_updated, 'removed', v_removed, 'refund_needed', v_refund);
END;
$$;
REVOKE ALL ON FUNCTION public.step_sync_admin_entrants(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.step_sync_admin_entrants(uuid, jsonb, boolean) TO authenticated, service_role;