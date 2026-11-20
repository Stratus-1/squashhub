-- Tiered (package) tournament fees: a partner's paid cover is priced as that partner's next event.
-- If the partner already paid R210 for one category, covering their second costs R100 (R310 package), not R210.
CREATE OR REPLACE FUNCTION public.champ_partner_cover_cents(p_champ_id uuid, p_partner_member_id uuid, p_group integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t record; r record; c record; f record; v_one int; v_groups int[]; v_all int;
        v_paid numeric := 0; v_other int := 0; k text;
BEGIN
  SELECT division_fees, entry_fee_basis, entry_fee_tiers INTO t FROM public.tournaments WHERE id = p_champ_id;
  IF NOT (coalesce(t.entry_fee_basis,'') = 'tiered' AND t.entry_fee_tiers IS NOT NULL
          AND jsonb_typeof(t.entry_fee_tiers) = 'object' AND coalesce(public.champ_entry_fee_cents(p_champ_id), 0) > 0) THEN
    RETURN coalesce(public.champ_division_fee_cents(p_champ_id, p_group), 0);
  END IF;
  v_one := public.champ_tier_fee_cents(t.entry_fee_tiers, 1);
  SELECT * INTO r FROM public.club_champs_registrations
   WHERE champ_id = p_champ_id AND club_member_id = p_partner_member_id
     AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn')
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN v_one; END IF;
  -- Once a cover is recorded its price stays fixed.
  IF r.covered_events ? p_group::text AND (r.covered_events -> p_group::text ->> 'cents') ~ '^[0-9]+$' THEN
    RETURN (r.covered_events -> p_group::text ->> 'cents')::int;
  END IF;
  v_groups := public.champ_reg_groups(r.division_choices);
  v_all := coalesce(array_length(v_groups, 1), 0) + CASE WHEN p_group = ANY(coalesce(v_groups, '{}'::int[])) THEN 0 ELSE 1 END;
  -- Already paid by the partner themselves: own entry fee + paid "additional events" charges.
  SELECT name INTO c FROM public.club_champs WHERE id = p_champ_id;
  IF r.fee_payment_id IS NOT NULL THEN
    SELECT * INTO f FROM public.club_member_fee_payments WHERE id = r.fee_payment_id;
    IF FOUND THEN
      SELECT coalesce(sum(x.amount), 0) INTO v_paid FROM public.club_member_fee_payments x
       WHERE x.paid AND (x.id = f.id OR (x.club_member_id = f.club_member_id AND x.fee_type = 'tournament_entry'
             AND x.season_year = f.season_year AND x.fee_label LIKE coalesce(c.name, 'Tournament') || ' entry fee – additional events%'));
    END IF;
  END IF;
  -- Plus other events of theirs that someone else already covered.
  FOR k IN SELECT jsonb_object_keys(coalesce(r.covered_events, '{}'::jsonb)) LOOP
    CONTINUE WHEN k = p_group::text OR (r.covered_events -> k ->> 'by') IS NOT DISTINCT FROM r.club_member_id::text;
    v_other := v_other + CASE WHEN (r.covered_events -> k ->> 'cents') ~ '^[0-9]+$' THEN (r.covered_events -> k ->> 'cents')::int ELSE v_one END;
  END LOOP;
  RETURN least(v_one, greatest(public.champ_tier_fee_cents(t.entry_fee_tiers, v_all) - round(v_paid * 100)::int - v_other, 0));
END $function$;

REVOKE ALL ON FUNCTION public.champ_partner_cover_cents(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.champ_partner_cover_cents(uuid, uuid, integer) TO authenticated, service_role;

CREATE FUNCTION pg_temp.fx_swap(d text, a text, b text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'expected fragment not found exactly once: %', left(a, 80);
  END IF;
  RETURN replace(d, a, b);
END $f$;

-- Apply exact text edits to the live definitions (each old fragment must occur exactly once).
DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.champ_reg_own_due_cents'::regproc);
  d := pg_temp.fx_swap(d, $x$v_all int; v_own int;
$x$,
    $x$v_all int; v_own int; v_cov int;
$x$);
  d := pg_temp.fx_swap(d, $x$    RETURN greatest(public.champ_tier_fee_cents(t.entry_fee_tiers, v_all)
                    - (v_all - v_own) * public.champ_tier_fee_cents(t.entry_fee_tiers, 1), 0);$x$,
    $x$    -- Less what each covering partner pays (priced as this player's next event).
    SELECT coalesce(sum(public.champ_partner_cover_cents(r.champ_id, r.club_member_id, g)), 0) INTO v_cov
      FROM unnest(public.champ_reg_groups(r.division_choices)) g
     WHERE public.champ_event_covered_by_other(r.id, g);
    RETURN greatest(public.champ_tier_fee_cents(t.entry_fee_tiers, v_all) - v_cov, 0);$x$);
  EXECUTE d;
  d := pg_get_functiondef('public.champ_mark_event_cover'::regproc);
  d := pg_temp.fx_swap(d, $x$DECLARE r record;
BEGIN
$x$,
    $x$DECLARE r record; v_cents int;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_partner_reg_id;
  IF FOUND THEN v_cents := public.champ_partner_cover_cents(r.champ_id, r.club_member_id, p_group); END IF;
$x$);
  d := pg_temp.fx_swap(d, $x$'via', p_via, 'at', now())$x$,
    $x$'via', p_via, 'at', now(), 'cents', v_cents)$x$);
  EXECUTE d;
  d := pg_get_functiondef('public._champ_record_partner_cover_fee'::regproc);
  d := pg_temp.fx_swap(d, $x$  v_cents := coalesce(
$x$,
    $x$  v_cents := coalesce(
    CASE WHEN (r.covered_events -> coalesce(p_group, 0)::text ->> 'cents') ~ '^[0-9]+$'
         THEN (r.covered_events -> coalesce(p_group, 0)::text ->> 'cents')::int END,
$x$);
  EXECUTE d;
  d := pg_get_functiondef('public.step_pair_payment_context'::regproc);
  d := pg_temp.fx_swap(d, $x$v_my_due int := 0;$x$,
    $x$v_my_due int := 0; v_cover int;$x$);
  d := pg_temp.fx_swap(d, $x$    v_p_owes := NOT public.champ_member_event_paid($x$,
    $x$    v_cover := public.champ_partner_cover_cents(v_reg.champ_id, v_partner.club_member_id, v_group);
    v_p_owes := NOT public.champ_member_event_paid($x$);
  d := pg_temp.fx_swap(d, $x$'fee_cents', v_fee, 'my_due_cents'$x$,
    $x$'fee_cents', coalesce(v_cover, v_fee), 'my_due_cents'$x$);
  d := pg_temp.fx_swap(d, $x$'amount', (v_fee + CASE$x$,
    $x$'amount', (coalesce(v_cover, v_fee) + CASE$x$);
  EXECUTE d;
  d := pg_get_functiondef('public.step_charge_pair_to_account'::regproc);
  d := pg_temp.fx_swap(d, $x$public.champ_entry_fee_cents(v_partner.champ_id), 0)::numeric / 100;$x$,
    $x$public.champ_partner_cover_cents(v_partner.champ_id, v_partner.club_member_id, v_group), 0)::numeric / 100;$x$);
  EXECUTE d;
  d := pg_get_functiondef('public.tournament_invite_payment_context'::regproc);
  d := pg_temp.fx_swap(d, $x$sum(public.champ_division_fee_cents(v_reg.champ_id, p.group_number))$x$,
    $x$sum(public.champ_partner_cover_cents(v_reg.champ_id, CASE WHEN p.member_a = v_reg.club_member_id THEN p.member_b ELSE p.member_a END, p.group_number))$x$);
  EXECUTE d;
  d := pg_get_functiondef('public._invite_amount_cents'::regproc);
  d := pg_temp.fx_swap(d, $x$sum(public.champ_division_fee_cents(p.champ_id, p.group_number))$x$,
    $x$sum(public.champ_partner_cover_cents(p.champ_id, CASE WHEN p.member_a = r.club_member_id THEN p.member_b ELSE p.member_a END, p.group_number))$x$);
  EXECUTE d;
  d := pg_get_functiondef('public.champ_member_total_due_cents'::regproc);
  d := pg_temp.fx_swap(d, $x$public.champ_division_fee_cents(p_champ_id, pr.group_number)$x$,
    $x$public.champ_partner_cover_cents(p_champ_id, v_partner, pr.group_number)$x$);
  EXECUTE d;
  d := pg_get_functiondef('public.invite_settle_entry'::regproc);
  d := pg_temp.fx_swap(d, $x$public.champ_division_fee_cents(r.champ_id, p.group_number)::numeric$x$,
    $x$public.champ_partner_cover_cents(r.champ_id, v_partner, p.group_number)::numeric$x$);
  EXECUTE d;
  d := pg_get_functiondef('public.get_doubles_pairing_state'::regproc);
  d := pg_temp.fx_swap(d, $x$'fee_cents', public.champ_division_fee_cents(p_champ_id, p.group_number),$x$,
    $x$'fee_cents', public.champ_partner_cover_cents(p_champ_id, CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END, p.group_number),$x$);
  d := pg_temp.fx_swap(d, $x$sum(public.champ_division_fee_cents(p_champ_id, p.group_number))$x$,
    $x$sum(public.champ_partner_cover_cents(p_champ_id, CASE WHEN p.member_a = v_me THEN p.member_b ELSE p.member_a END, p.group_number))$x$);
  EXECUTE d;
  d := pg_get_functiondef('public.refresh_tournament_entry_fee'::regproc);
  d := pg_temp.fx_swap(d, $x$v_have numeric;$x$,
    $x$v_have numeric; v_excess numeric;$x$);
  d := pg_temp.fx_swap(d, $x$  END IF;
  RETURN f.id;$x$,
    $x$  ELSIF v_target < coalesce(f.amount,0) + v_have THEN
    -- Charged too much (e.g. a partner has since paid for one of these events):
    -- shrink only unpaid, uninvoiced 'additional events' charges. Paid fees never change.
    v_excess := coalesce(f.amount,0) + v_have - v_target;
    FOR x IN SELECT * FROM public.club_member_fee_payments
              WHERE club_member_id = v_bill AND fee_type = 'tournament_entry' AND fee_label LIKE v_label || '%'
                AND season_year = f.season_year AND NOT paid AND invoice_issued_at IS NULL
              ORDER BY created_at DESC LOOP
      EXIT WHEN v_excess <= 0;
      PERFORM public._champ_fee_adjust(x.id, greatest(x.amount - v_excess, 0), 'Additional events charge reduced: partner paid or event removed');
      v_excess := v_excess - least(x.amount, v_excess);
    END LOOP;
  END IF;
  RETURN f.id;$x$);
  EXECUTE d;
  d := pg_get_functiondef('public.journal_fee_payment_received'::regproc);
  d := pg_temp.fx_swap(d, $x$  IF v_debits <= 0 THEN
    v_amount := COALESCE(NEW.amount, 0);
  ELSIF COALESCE(NEW.amount, 0) > 0 THEN
    v_amount := LEAST(v_debits, NEW.amount);
  ELSE
    v_amount := v_debits;
  END IF;

  SELECT COALESCE(sum(credit), 0) INTO v_credited FROM public.club_journal_entries
  WHERE fee_payment_id = NEW.id AND account = 'debtors'::public.gl_account AND credit > 0;
  v_amount := v_amount - COALESCE(v_credited, 0);$x$,
    $x$  SELECT COALESCE(sum(credit), 0) INTO v_credited FROM public.club_journal_entries
  WHERE fee_payment_id = NEW.id AND account = 'debtors'::public.gl_account AND credit > 0;
  IF v_debits <= 0 THEN
    v_amount := COALESCE(NEW.amount, 0) - v_credited;
  ELSE
    -- Bank what is still open on this fee (charges less reductions/earlier receipts),
    -- capped at the row's amount; a reduced fee must still record its payment.
    v_amount := v_debits - v_credited;
    IF COALESCE(NEW.amount, 0) > 0 THEN v_amount := LEAST(v_amount, NEW.amount); END IF;
  END IF;$x$);
  EXECUTE d;
END $mig$;
DROP FUNCTION pg_temp.fx_swap(text, text, text);