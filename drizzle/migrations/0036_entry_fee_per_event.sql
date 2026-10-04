-- Entry fee per event; partner payment covers only the shared doubles event.
ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS covered_events jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.club_champs_registrations.covered_events IS
  'Per-event cover by another member: {"<group>": {"by": "<payer member id>", "paid": true|false, "via": "card|account"}}';

CREATE OR REPLACE FUNCTION public.champ_reg_groups(p_choices int[])
RETURNS int[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN coalesce(cardinality(p_choices), 0) = 0 THEN ARRAY[0] ELSE p_choices END;
$$;

CREATE OR REPLACE FUNCTION public.champ_event_covered_by_other(p_reg_id uuid, p_group int)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_champs_registrations r
     WHERE r.id = p_reg_id
       AND (
         (r.covered_events ? p_group::text AND (r.covered_events -> p_group::text ->> 'by') IS DISTINCT FROM r.club_member_id::text)
         OR EXISTS (
           SELECT 1 FROM public.champ_doubles_pairs p
            WHERE p.champ_id = r.champ_id AND (p_group = 0 OR p.group_number = p_group)
              AND p.pays_for_partner AND p.status IN ('pending','awaiting_payment','confirmed')
              AND coalesce(p.payer_member_id, p.proposed_by) <> r.club_member_id
              AND r.club_member_id IN (p.member_a, p.member_b))
       ));
$$;

CREATE OR REPLACE FUNCTION public.champ_reg_own_events(p_reg_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*)::int
    FROM public.club_champs_registrations r, unnest(public.champ_reg_groups(r.division_choices)) g
   WHERE r.id = p_reg_id AND NOT public.champ_event_covered_by_other(r.id, g);
$$;

CREATE OR REPLACE FUNCTION public.champ_reg_own_due_cents(p_reg_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(public.champ_entry_fee_cents(r.champ_id), coalesce(c.entry_fee_cents, 0)) * public.champ_reg_own_events(r.id)
    FROM public.club_champs_registrations r JOIN public.club_champs c ON c.id = r.champ_id
   WHERE r.id = p_reg_id;
$$;

CREATE OR REPLACE FUNCTION public.champ_member_event_paid(p_champ_id uuid, p_member_id uuid, p_group int)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; c jsonb;
BEGIN
  IF coalesce(public.champ_entry_fee_cents(p_champ_id), 0) = 0 THEN RETURN true; END IF;
  SELECT * INTO r FROM public.club_champs_registrations
   WHERE champ_id = p_champ_id AND club_member_id = p_member_id
     AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn')
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  IF public.champ_event_covered_by_other(r.id, p_group) THEN
    c := r.covered_events -> p_group::text;
    RETURN coalesce((c ->> 'paid')::boolean, false) OR (c ->> 'via') = 'account'
        OR (lower(coalesce(r.status,'')) IN ('paid','waived') AND r.paid_by_member_id IS NOT NULL AND r.paid_by_member_id <> r.club_member_id);
  END IF;
  RETURN public.champ_member_fee_settled(p_champ_id, p_member_id);
END $$;

CREATE OR REPLACE FUNCTION public._champ_fee_adjust(p_fee_id uuid, p_new_amount numeric, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f record; v_club uuid; v_diff numeric; v_ref uuid;
BEGIN
  SELECT * INTO f FROM public.club_member_fee_payments WHERE id = p_fee_id;
  IF NOT FOUND OR f.paid OR f.invoice_issued_at IS NOT NULL THEN RETURN p_fee_id; END IF;
  v_diff := round(coalesce(p_new_amount, 0), 2) - coalesce(f.amount, 0);
  IF v_diff = 0 THEN RETURN p_fee_id; END IF;
  SELECT club_id INTO v_club FROM public.club_members WHERE id = f.club_member_id;
  v_ref := gen_random_uuid();
  IF v_club IS NOT NULL THEN
    INSERT INTO public.club_journal_entries (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
    VALUES (v_club, f.club_member_id, CASE WHEN p_new_amount > 0 THEN f.id END, 'debtors', greatest(v_diff,0), greatest(-v_diff,0), 'Entry fee adjusted: ' || coalesce(f.fee_label,''), v_ref),
           (v_club, f.club_member_id, CASE WHEN p_new_amount > 0 THEN f.id END, 'tournament_income', greatest(-v_diff,0), greatest(v_diff,0), 'Entry fee adjusted: ' || coalesce(f.fee_label,''), v_ref);
    INSERT INTO public.ledger_audit_log (club_id, journal_ref, action, actor_user_id, after_json, note)
    VALUES (v_club, v_ref, 'edit', auth.uid(),
            jsonb_build_object('fee_payment_id', f.id, 'from', f.amount, 'to', p_new_amount), p_note);
  END IF;
  IF coalesce(p_new_amount, 0) <= 0 THEN
    UPDATE public.club_champs_registrations SET fee_payment_id = NULL WHERE fee_payment_id = f.id;
    DELETE FROM public.club_member_fee_payments WHERE id = f.id AND paid = false;
    RETURN NULL;
  END IF;
  UPDATE public.club_member_fee_payments SET amount = p_new_amount WHERE id = f.id;
  RETURN f.id;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_tournament_entry_fee(p_registration_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_reg record; v_champ record; v_amount numeric; v_label text; v_fee_id uuid; v_bill_member uuid;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_reg.fee_payment_id IS NOT NULL THEN RETURN v_reg.fee_payment_id; END IF;
  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_amount := coalesce(public.champ_reg_own_due_cents(p_registration_id), 0)::numeric / 100;
  IF v_amount <= 0 THEN RETURN NULL; END IF;
  v_label := coalesce(v_champ.name, 'Tournament') || ' entry fee';
  v_bill_member := public.resolve_host_billing_member(v_reg.club_member_id, v_champ.club_id);
  INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
  VALUES (v_bill_member, 'tournament_entry', v_label, v_amount, false,
          EXTRACT(YEAR FROM coalesce(v_champ.start_date, now()))::int)
  ON CONFLICT (club_member_id, fee_type, fee_label, season_year)
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_fee_id;
  IF v_fee_id IS NOT NULL THEN
    PERFORM public._champ_fee_adjust(v_fee_id, v_amount, 'Entry fee set to the events entered');
  END IF;
  UPDATE public.club_champs_registrations SET fee_payment_id = coalesce(fee_payment_id, v_fee_id) WHERE id = p_registration_id;
  RETURN v_fee_id;
END $function$;

CREATE OR REPLACE FUNCTION public.refresh_tournament_entry_fee(p_registration_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; ch record; f record; x record; v_target numeric; v_have numeric; v_label text; v_bill uuid;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.confirmed_at IS NULL OR lower(coalesce(r.status,'')) IN ('cancelled','declined','withdrawn','waived') THEN RETURN r.fee_payment_id; END IF;
  SELECT * INTO ch FROM public.club_champs WHERE id = r.champ_id;
  v_target := coalesce(public.champ_reg_own_due_cents(r.id), 0)::numeric / 100;
  IF r.fee_payment_id IS NULL THEN
    IF v_target > 0 AND r.fee_settled_via IS NULL AND lower(coalesce(r.status,'')) IN ('pending_payment','pending_eft') THEN
      RETURN public.ensure_tournament_entry_fee(r.id);
    END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO f FROM public.club_member_fee_payments WHERE id = r.fee_payment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT f.paid AND f.invoice_issued_at IS NULL THEN
    RETURN public._champ_fee_adjust(f.id, v_target, 'Entry fee changed: events entered or partner cover changed');
  END IF;
  v_label := coalesce(ch.name, 'Tournament') || ' entry fee – additional events';
  v_bill := f.club_member_id;
  SELECT coalesce(sum(amount),0) INTO v_have FROM public.club_member_fee_payments
   WHERE club_member_id = v_bill AND fee_type = 'tournament_entry' AND fee_label LIKE v_label || '%'
     AND season_year = f.season_year;
  IF v_target > coalesce(f.amount,0) + v_have THEN
    SELECT * INTO x FROM public.club_member_fee_payments
     WHERE club_member_id = v_bill AND fee_type = 'tournament_entry' AND fee_label = v_label
       AND season_year = f.season_year AND NOT paid AND invoice_issued_at IS NULL;
    IF FOUND THEN
      PERFORM public._champ_fee_adjust(x.id, x.amount + (v_target - f.amount - v_have), 'Additional tournament event entered');
    ELSE
      INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
      VALUES (v_bill, 'tournament_entry',
              CASE WHEN v_have > 0 THEN v_label || ' (' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ')' ELSE v_label END,
              v_target - f.amount - v_have, false, f.season_year);
    END IF;
  END IF;
  RETURN f.id;
END $$;

CREATE OR REPLACE FUNCTION public.tg_registration_refresh_entry_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.division_choices IS DISTINCT FROM OLD.division_choices OR NEW.covered_events IS DISTINCT FROM OLD.covered_events THEN
    PERFORM public.refresh_tournament_entry_fee(NEW.id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_registration_refresh_entry_fee ON public.club_champs_registrations;
CREATE TRIGGER trg_registration_refresh_entry_fee AFTER UPDATE OF division_choices, covered_events
  ON public.club_champs_registrations FOR EACH ROW EXECUTE FUNCTION public.tg_registration_refresh_entry_fee();

CREATE OR REPLACE FUNCTION public.tg_pair_refresh_entry_fees()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE rid uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.pays_for_partner IS NOT DISTINCT FROM OLD.pays_for_partner
     AND NEW.payer_member_id IS NOT DISTINCT FROM OLD.payer_member_id THEN RETURN NULL; END IF;
  FOR rid IN SELECT id FROM public.club_champs_registrations
              WHERE champ_id = NEW.champ_id AND club_member_id IN (NEW.member_a, NEW.member_b)
                AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn') LOOP
    PERFORM public.refresh_tournament_entry_fee(rid);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pair_refresh_entry_fees ON public.champ_doubles_pairs;
CREATE TRIGGER trg_pair_refresh_entry_fees AFTER INSERT OR UPDATE ON public.champ_doubles_pairs
  FOR EACH ROW EXECUTE FUNCTION public.tg_pair_refresh_entry_fees();

CREATE OR REPLACE FUNCTION public.champ_mark_event_cover(p_partner_reg_id uuid, p_group int, p_payer uuid, p_via text, p_ref text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  UPDATE public.club_champs_registrations
     SET covered_events = covered_events || jsonb_build_object(p_group::text,
           jsonb_build_object('by', p_payer, 'paid', p_via <> 'account', 'via', p_via, 'at', now())),
         paid_by_member_id = coalesce(paid_by_member_id, p_payer)
   WHERE id = p_partner_reg_id;
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_partner_reg_id;
  IF public.champ_reg_own_events(r.id) = 0 AND NOT public.champ_member_fee_settled(r.champ_id, r.club_member_id) THEN
    IF p_via = 'account' THEN
      UPDATE public.club_champs_registrations SET fee_settled_via = 'account', fee_settled_via_at = now() WHERE id = r.id AND fee_settled_via IS NULL;
    ELSE
      UPDATE public.club_champs_registrations
         SET status = 'paid', paid_at = coalesce(paid_at, now()), payment_ref = coalesce(payment_ref, p_ref),
             confirmed_at = coalesce(confirmed_at, now())
       WHERE id = r.id AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn','paid','waived');
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.champ_pair_settle(p_pair_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE p record; v_paid_a boolean; v_paid_b boolean; v_next text;
BEGIN
  SELECT * INTO p FROM public.champ_doubles_pairs WHERE id = p_pair_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p.status IN ('rejected','cancelled') THEN RETURN p.status; END IF;
  IF p.accepted_at IS NULL THEN RETURN p.status; END IF;
  v_paid_a := public.champ_member_event_paid(p.champ_id, p.member_a, p.group_number);
  v_paid_b := public.champ_member_event_paid(p.champ_id, p.member_b, p.group_number);
  v_next := CASE WHEN v_paid_a AND v_paid_b THEN 'confirmed' ELSE 'awaiting_payment' END;
  UPDATE public.champ_doubles_pairs
     SET status = v_next, locked_at = CASE WHEN v_next = 'confirmed' THEN coalesce(locked_at, now()) ELSE NULL END
   WHERE id = p.id;
  IF v_next = 'confirmed' THEN
    UPDATE public.champ_doubles_pairs SET status = 'cancelled', responded_at = now()
     WHERE champ_id = p.champ_id AND group_number = p.group_number AND id <> p.id
       AND status IN ('pending','awaiting_payment')
       AND (member_a IN (p.member_a, p.member_b) OR member_b IN (p.member_a, p.member_b));
    PERFORM public.champ_sync_pair_entries(p.champ_id, p.group_number, p.member_a, p.member_b);
  END IF;
  RETURN v_next;
END $function$;

CREATE OR REPLACE FUNCTION public.champ_apply_paid_registration(p_registration_id uuid, p_payment_ref text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_reg record; pr record; v_partner uuid; v_preg uuid; v_covered int := 0;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  FOR pr IN
    SELECT * FROM public.champ_doubles_pairs p
     WHERE p.champ_id = v_reg.champ_id AND p.pays_for_partner
       AND coalesce(p.payer_member_id, p.proposed_by) = v_reg.club_member_id
       AND p.status IN ('pending','awaiting_payment','confirmed')
  LOOP
    v_partner := CASE WHEN pr.member_a = v_reg.club_member_id THEN pr.member_b ELSE pr.member_a END;
    CONTINUE WHEN v_partner = v_reg.club_member_id;
    CONTINUE WHEN public.champ_member_event_paid(v_reg.champ_id, v_partner, pr.group_number);
    v_preg := NULL;
    SELECT id INTO v_preg FROM public.club_champs_registrations
     WHERE champ_id = v_reg.champ_id AND club_member_id = v_partner
       AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn')
     ORDER BY created_at DESC LIMIT 1;
    CONTINUE WHEN v_preg IS NULL;
    PERFORM public.champ_mark_event_cover(v_preg, pr.group_number, v_reg.club_member_id, 'card', p_payment_ref);
    v_covered := v_covered + 1;
  END LOOP;
  FOR pr IN
    SELECT id FROM public.champ_doubles_pairs p
     WHERE p.champ_id = v_reg.champ_id
       AND coalesce(p.payer_member_id, p.proposed_by) = v_reg.club_member_id
       AND p.status IN ('pending','awaiting_payment')
  LOOP
    PERFORM public.champ_pair_settle(pr.id);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'covered_partners', v_covered);
END $function$;

CREATE OR REPLACE FUNCTION public.champ_registration_payment_settles_pairs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE pr record;
BEGIN
  IF NOT public.champ_member_fee_paid(NEW.champ_id, NEW.club_member_id) THEN RETURN NEW; END IF;
  FOR pr IN
    SELECT id FROM public.champ_doubles_pairs
     WHERE champ_id = NEW.champ_id AND status IN ('pending','awaiting_payment')
       AND NEW.club_member_id IN (member_a, member_b)
  LOOP
    PERFORM public.champ_pair_settle(pr.id);
  END LOOP;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.tournament_invite_payment_context(p_token text, p_verify text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_reg record; v_champ record; v_member record; v_fee integer; v_own integer := 0; v_own_events int := 0;
  v_pairs int := 0; v_amount numeric; v_covered jsonb; v_actor uuid;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid');
  END IF;
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND OR v_reg.invite_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid');
  END IF;
  SELECT id, club_id, name, email, phone, user_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid'); END IF;
  v_actor := coalesce(auth.uid(), p_user_id);
  IF NOT (v_actor IS NOT NULL AND v_member.user_id IS NOT NULL AND v_actor = v_member.user_id) THEN
    IF NOT public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
      RETURN jsonb_build_object('ok', false, 'needs_verification', true,
        'error', 'We could not verify that this invitation is yours. Please check the detail you entered.');
    END IF;
  END IF;
  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid'); END IF;
  IF v_reg.fee_settled_via = 'account' THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'This entry fee is already charged to the member account — settle it from My Account');
  END IF;
  IF lower(coalesce(v_reg.fee_status,'')) IN ('paid','waived') THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'This entry fee is already paid');
  END IF;
  v_fee := coalesce(public.champ_entry_fee_cents(v_reg.champ_id), 0);
  IF v_fee <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'This tournament has no entry fee to pay'); END IF;

  IF NOT public.champ_member_fee_settled(v_reg.champ_id, v_reg.club_member_id) THEN
    v_own_events := public.champ_reg_own_events(v_reg.id);
    v_own := v_fee * v_own_events;
  END IF;

  SELECT count(*)::int,
         coalesce(jsonb_agg(DISTINCT CASE WHEN p.member_a = v_reg.club_member_id THEN p.member_b ELSE p.member_a END), '[]'::jsonb)
    INTO v_pairs, v_covered
    FROM public.champ_doubles_pairs p
   WHERE p.champ_id = v_reg.champ_id AND p.pays_for_partner
     AND coalesce(p.payer_member_id, p.proposed_by) = v_reg.club_member_id
     AND p.status IN ('pending','awaiting_payment','confirmed')
     AND p.member_a <> p.member_b
     AND NOT public.champ_member_event_paid(v_reg.champ_id, CASE WHEN p.member_a = v_reg.club_member_id THEN p.member_b ELSE p.member_a END, p.group_number);

  IF v_own_events = 0 AND coalesce(v_pairs,0) = 0 THEN
    IF EXISTS (SELECT 1 FROM public.champ_doubles_pairs p
                WHERE p.champ_id = v_reg.champ_id AND p.status IN ('pending','awaiting_payment','confirmed')
                  AND p.pays_for_partner AND coalesce(p.payer_member_id, p.proposed_by) <> v_reg.club_member_id
                  AND v_reg.club_member_id IN (p.member_a, p.member_b)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Your partner is paying your entry fee for this event');
    END IF;
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'There is nothing outstanding on this entry');
  END IF;

  v_amount := (v_own + v_fee * coalesce(v_pairs,0))::numeric / 100;
  RETURN jsonb_build_object(
    'ok', true, 'club_id', v_member.club_id, 'club_member_id', v_member.id, 'registration_id', v_reg.id,
    'champ_id', v_reg.champ_id, 'user_id', v_member.user_id, 'amount', v_amount,
    'fee_payment_id', v_reg.fee_payment_id, 'covered_member_ids', v_covered,
    'covered_entries', v_own_events + coalesce(v_pairs,0), 'own_events', v_own_events, 'partner_events', coalesce(v_pairs,0),
    'event_fee_cents', v_fee,
    'description', coalesce(v_champ.name, 'Tournament') || ' entry fees (' || (v_own_events + coalesce(v_pairs,0)) || ' event'
                   || CASE WHEN v_own_events + coalesce(v_pairs,0) = 1 THEN '' ELSE 's' END || ')'
  );
END $function$;

CREATE OR REPLACE FUNCTION public.champ_shared_group(p_partner_reg_id uuid, p_payer uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    (SELECT k::int FROM public.club_champs_registrations r, jsonb_each_text(coalesce(r.division_partners,'{}'::jsonb)) e(k, v)
      WHERE r.id = p_partner_reg_id AND v = p_payer::text LIMIT 1),
    (SELECT (public.champ_reg_groups(r.division_choices))[1] FROM public.club_champs_registrations r WHERE r.id = p_partner_reg_id),
    0);
$$;

CREATE OR REPLACE FUNCTION public.step_pair_payment_context(p_registration_id uuid, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_scope text DEFAULT 'options'::text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_reg record; v_partner record; v_me record; v_pm record; v_t record; v_c record;
  v_actor uuid; v_fee int; v_me_owes boolean; v_p_owes boolean; v_enabled boolean; v_guest boolean := false;
  v_verified boolean := true; v_pname text; v_account boolean; v_group int; v_my_due int := 0;
BEGIN
  v_actor := CASE WHEN auth.uid() IS NOT NULL THEN auth.uid()
                  WHEN coalesce(auth.role(),'') = 'service_role' THEN p_user_id ELSE NULL END;
  IF p_token IS NOT NULL AND length(p_token) >= 32 THEN
    SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token AND invite_revoked_at IS NULL;
  ELSE
    SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Entry not found'); END IF;
  SELECT id, club_id, user_id, name INTO v_me FROM public.club_members WHERE id = v_reg.club_member_id;

  IF NOT (v_actor IS NOT NULL AND v_actor = v_me.user_id) THEN
    IF public.member_is_delegate_of(v_reg.club_member_id, v_actor) THEN
      NULL;
    ELSIF p_token IS NOT NULL AND length(p_token) >= 32 THEN
      v_guest := true;
      v_verified := public.invite_verification_ok(v_reg.club_member_id, p_verify);
      IF NOT v_verified AND p_scope <> 'options' THEN
        RETURN jsonb_build_object('ok', false, 'needs_verification', true, 'error', 'We could not verify that this invitation is yours. Please check the detail you entered.');
      END IF;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Not authorised for this entry');
    END IF;
  END IF;

  SELECT id, name, beta_lifecycle INTO v_t FROM public.tournaments WHERE id = v_reg.champ_id;
  SELECT payment_methods INTO v_c FROM public.club_champs WHERE id = v_reg.champ_id;
  v_enabled := coalesce((v_t.beta_lifecycle->>'partner_pay')::boolean, false);
  v_account := coalesce('account' = ANY(v_c.payment_methods), false);
  v_fee := coalesce(public.champ_entry_fee_cents(v_reg.champ_id), 0);

  IF v_reg.partner_member_id IS NOT NULL THEN
    SELECT * INTO v_partner FROM public.club_champs_registrations
     WHERE champ_id = v_reg.champ_id AND club_member_id = v_reg.partner_member_id
       AND partner_member_id = v_reg.club_member_id
       AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn');
  END IF;

  v_me_owes := lower(coalesce(v_reg.status,'')) NOT IN ('cancelled','declined','withdrawn')
               AND NOT public.champ_member_fee_settled(v_reg.champ_id, v_reg.club_member_id);
  IF v_me_owes THEN v_my_due := coalesce(public.champ_reg_own_due_cents(v_reg.id), 0); END IF;
  IF v_partner.id IS NOT NULL THEN
    v_group := public.champ_shared_group(v_partner.id, v_reg.club_member_id);
    v_p_owes := NOT public.champ_member_event_paid(v_reg.champ_id, v_partner.club_member_id, v_group);
    SELECT name INTO v_pm FROM public.club_members WHERE id = v_partner.club_member_id;
    v_pname := CASE WHEN v_guest
      THEN split_part(trim(coalesce(v_pm.name,'')), ' ', 1) || coalesce(' ' || nullif(left(regexp_replace(trim(coalesce(v_pm.name,'')), '^\S+\s*', ''), 1), '') || '.', '')
      ELSE coalesce(v_pm.name, 'your partner') END;
  END IF;

  IF p_scope = 'options' THEN
    RETURN jsonb_build_object('ok', true, 'enabled', v_enabled AND v_fee > 0 AND v_partner.id IS NOT NULL,
      'partner_name', v_pname, 'partner_owes', coalesce(v_p_owes,false), 'me_owes', v_me_owes,
      'fee_cents', v_fee, 'my_due_cents', v_my_due, 'partner_group', v_group,
      'account_allowed', v_account, 'needs_verification', NOT v_verified,
      'partner_settled_via', CASE WHEN v_partner.id IS NULL THEN NULL WHEN v_partner.fee_settled_via = 'account' THEN 'account'
                                  WHEN NOT coalesce(v_p_owes,false) THEN 'paid' END);
  END IF;

  IF NOT v_enabled OR v_fee <= 0 OR v_partner.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Paying for your partner is not available for this tournament');
  END IF;
  IF NOT coalesce(v_p_owes,false) THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'Your partner''s entry fee is already settled');
  END IF;
  IF p_scope = 'both' AND NOT v_me_owes THEN
    RETURN jsonb_build_object('ok', false, 'already_settled', true, 'error', 'Your own entry fee is already settled — pay your partner''s fee only');
  END IF;
  IF p_scope NOT IN ('partner','both') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid payment choice');
  END IF;

  RETURN jsonb_build_object('ok', true,
    'club_id', v_me.club_id, 'club_member_id', v_me.id, 'user_id', v_me.user_id,
    'my_registration_id', v_reg.id, 'partner_registration_id', v_partner.id, 'partner_group', v_group,
    'registration_id', CASE WHEN p_scope = 'partner' THEN v_partner.id ELSE v_reg.id END,
    'cover_registration_ids', CASE WHEN p_scope = 'both' THEN jsonb_build_array(v_partner.id) ELSE '[]'::jsonb END,
    'payer_member_id', v_me.id, 'account_allowed', v_account, 'partner_name', v_pname,
    'amount', (v_fee + CASE WHEN p_scope = 'both' THEN v_my_due ELSE 0 END)::numeric / 100,
    'description', coalesce(v_t.name,'Tournament') || CASE WHEN p_scope = 'both' THEN ' entry fees (you and ' || coalesce(v_pname,'partner') || ')' ELSE ' entry fee for ' || coalesce(v_pname,'your partner') || ' (one event)' END);
END $function$;

CREATE OR REPLACE FUNCTION public.step_apply_partner_cover(p_primary_registration_id uuid, p_cover_ids uuid[], p_payer_member_id uuid, p_payment_ref text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_primary record; r record; v_n int := 0;
BEGIN
  SELECT * INTO v_primary FROM public.club_champs_registrations WHERE id = p_primary_registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  IF v_primary.club_member_id <> p_payer_member_id THEN
    PERFORM public.champ_mark_event_cover(v_primary.id, public.champ_shared_group(v_primary.id, p_payer_member_id), p_payer_member_id, 'card', p_payment_ref);
    v_n := 1;
  ELSE
    UPDATE public.club_champs_registrations
       SET fee_paid_cents = coalesce(public.champ_reg_own_due_cents(id), 0)
     WHERE id = p_primary_registration_id;
  END IF;
  FOR r IN SELECT * FROM public.club_champs_registrations
            WHERE id = ANY(coalesce(p_cover_ids,'{}')) AND champ_id = v_primary.champ_id
              AND partner_member_id = p_payer_member_id
              AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn','paid','waived')
              AND fee_settled_via IS NULL
  LOOP
    PERFORM public.champ_mark_event_cover(r.id, public.champ_shared_group(r.id, p_payer_member_id), p_payer_member_id, 'card', p_payment_ref);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'covered', v_n);
END $function$;

CREATE OR REPLACE FUNCTION public.step_charge_pair_to_account(p_registration_id uuid, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text, p_scope text DEFAULT 'partner'::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
          || CASE WHEN v_group > 0 THEN ' (event ' || v_group || ')' ELSE '' END,
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
END $function$;

CREATE OR REPLACE FUNCTION public.charge_champ_entries_to_payer(p_registration_ids uuid[], p_payer_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE payer record; r record; ch record; v_amount numeric; v_label text; v_fee_id uuid; v_fee_ids uuid[] := '{}'; v_total numeric := 0;
BEGIN
  SELECT * INTO payer FROM public.club_members WHERE id = p_payer_member_id;
  IF payer.id IS NULL THEN RAISE EXCEPTION 'Paying member not found'; END IF;
  IF payer.user_id IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.member_account_delegations d
       WHERE d.member_id = p_payer_member_id AND d.status = 'accepted'
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
       AND coalesce(reg.paid_by_member_id, reg.club_member_id) = p_payer_member_id
       AND lower(coalesce(reg.status, '')) IN ('pending_payment', 'pending_eft')
  LOOP
    SELECT * INTO ch FROM public.club_champs WHERE id = r.champ_id;
    CONTINUE WHEN ch.id IS NULL;
    v_amount := coalesce(public.champ_reg_own_due_cents(r.id), 0)::numeric / 100;
    CONTINUE WHEN v_amount <= 0;
    IF r.club_member_id = p_payer_member_id THEN
      v_fee_id := public.ensure_tournament_entry_fee(r.id);
    ELSE
      v_label := coalesce(ch.name, 'Tournament') || ' entry fee — ' || coalesce(r.player_name, 'player');
      INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
      VALUES (p_payer_member_id, 'tournament_entry', v_label, v_amount, false, EXTRACT(YEAR FROM coalesce(ch.start_date, now()))::int)
      ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO UPDATE SET updated_at = now()
      RETURNING id INTO v_fee_id;
      PERFORM public._champ_fee_adjust(v_fee_id, v_amount, 'Entry fee set to the events entered');
      UPDATE public.club_champs_registrations SET fee_payment_id = coalesce(fee_payment_id, v_fee_id) WHERE id = r.id;
    END IF;
    IF v_fee_id IS NOT NULL THEN v_fee_ids := v_fee_ids || v_fee_id; v_total := v_total + v_amount; END IF;
  END LOOP;
  RETURN jsonb_build_object('fee_ids', to_jsonb(v_fee_ids), 'total', v_total, 'count', coalesce(array_length(v_fee_ids, 1), 0));
END $function$;

CREATE OR REPLACE FUNCTION public.accept_tournament_invite(p_registration_id uuid, p_accept boolean, p_divisions integer[] DEFAULT NULL::integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_reg record; v_champ record; v_member record; v_fee_id uuid; v_due int;
  v_next_status text; v_allowed int[]; v_choices int[]; v_auto int;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;
  SELECT * INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF v_member.user_id IS NULL OR v_member.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorised for this registration';
  END IF;
  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;

  IF NOT p_accept THEN
    UPDATE public.club_champs_registrations
       SET status = 'cancelled', confirmed_at = NULL, confirmed_by = NULL, confirmation_source = NULL
     WHERE id = p_registration_id;
    RETURN jsonb_build_object('status', 'cancelled');
  END IF;

  IF p_divisions IS NOT NULL AND array_length(p_divisions, 1) > 0 THEN
    SELECT array_agg((d ->> 'group_number')::int) INTO v_allowed
      FROM jsonb_array_elements(public.tournament_division_options(v_reg.champ_id, v_reg.club_member_id)) d;
    SELECT array_agg(DISTINCT x) INTO v_choices FROM unnest(p_divisions) x WHERE x = ANY (coalesce(v_allowed, '{}'));
    IF coalesce(array_length(v_choices, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Please choose at least one division you are eligible for';
    END IF;
    UPDATE public.club_champs_registrations SET division_choices = v_choices WHERE id = p_registration_id;
  ELSIF coalesce(array_length(v_reg.division_choices, 1), 0) = 0 THEN
    v_auto := public.tournament_league_division_for(v_reg.champ_id, v_reg.club_member_id);
    IF v_auto IS NOT NULL THEN
      UPDATE public.club_champs_registrations SET division_choices = ARRAY[v_auto] WHERE id = p_registration_id;
    END IF;
  END IF;

  v_due := coalesce(public.champ_reg_own_due_cents(p_registration_id), 0);
  IF coalesce(v_champ.payment_required, false) AND v_due > 0 AND NOT public.champ_member_fee_paid(v_reg.champ_id, v_reg.club_member_id) THEN
    v_next_status := CASE WHEN v_reg.status = 'pending_eft' THEN 'pending_eft' ELSE 'pending_payment' END;
  ELSIF coalesce(v_champ.payment_required, false) AND v_due > 0 THEN
    v_next_status := coalesce(v_reg.status, 'paid');
  ELSE
    v_next_status := 'paid';
  END IF;

  UPDATE public.club_champs_registrations
     SET status = v_next_status,
         confirmed_at = coalesce(confirmed_at, now()),
         confirmed_by = coalesce(confirmed_by, auth.uid()),
         confirmation_source = coalesce(confirmation_source, 'rsvp')
   WHERE id = p_registration_id;

  IF coalesce(v_champ.payment_required, false) AND v_due > 0 THEN
    v_fee_id := public.refresh_tournament_entry_fee(p_registration_id);
  END IF;

  PERFORM public.apply_registration_division_choices(p_registration_id);
  RETURN jsonb_build_object('status', v_next_status, 'fee_payment_id', v_fee_id, 'amount_cents', v_due);
END $function$;

CREATE OR REPLACE FUNCTION public.champ_registration_fee_breakdown(p_registration_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'event_fee_cents', coalesce(public.champ_entry_fee_cents(r.champ_id), 0),
    'events', cardinality(public.champ_reg_groups(r.division_choices)),
    'own_events', public.champ_reg_own_events(r.id),
    'own_due_cents', coalesce(public.champ_reg_own_due_cents(r.id), 0))
  FROM public.club_champs_registrations r
  WHERE r.id = p_registration_id
    AND ((public.is_club_admin(auth.uid(), (SELECT club_id FROM public.club_champs WHERE id = r.champ_id)) OR public.has_role(auth.uid(), 'admin'))
         OR EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = r.club_member_id AND m.user_id = auth.uid())
         OR public.member_is_delegate_of(r.club_member_id, auth.uid()));
$$;
GRANT EXECUTE ON FUNCTION public.champ_registration_fee_breakdown(uuid) TO authenticated;
