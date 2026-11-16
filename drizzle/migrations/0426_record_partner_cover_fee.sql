CREATE OR REPLACE FUNCTION public._champ_record_partner_cover_fee(p_partner_reg_id uuid, p_group integer, p_payer uuid, p_ref text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; ch record; t record; f record; v_cents int; v_amount numeric; v_key text; v_bill uuid;
        v_label text; v_payer_name text; v_season int; v_id uuid;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_partner_reg_id;
  IF NOT FOUND OR p_payer IS NULL OR r.club_member_id = p_payer THEN RETURN NULL; END IF;
  IF lower(coalesce(r.status,'')) IN ('cancelled','declined','withdrawn','waived') THEN RETURN NULL; END IF;
  v_key := 'cover:' || p_partner_reg_id::text || ':' || coalesce(p_group, 0)::text;
  SELECT id INTO v_id FROM public.club_member_fee_payments WHERE champ_charge_key = v_key;
  IF FOUND THEN RETURN v_id; END IF;
  -- This same payment already settled the partner's own fee row (e.g. "pay my partner's fee").
  IF r.fee_payment_id IS NOT NULL THEN
    SELECT * INTO f FROM public.club_member_fee_payments WHERE id = r.fee_payment_id;
    IF FOUND AND f.paid AND r.payment_ref IS NOT DISTINCT FROM p_ref THEN RETURN NULL; END IF;
  END IF;
  SELECT * INTO ch FROM public.club_champs WHERE id = r.champ_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT division_fees INTO t FROM public.tournaments WHERE id = r.champ_id;
  v_cents := coalesce(
    CASE WHEN t.division_fees IS NOT NULL AND jsonb_typeof(t.division_fees) = 'object'
         THEN (t.division_fees ->> coalesce(p_group, 0)::text)::int END,
    public.champ_entry_fee_cents(r.champ_id),
    ch.entry_fee_cents, 0);
  IF v_cents <= 0 THEN RETURN NULL; END IF;
  v_amount := v_cents::numeric / 100;
  v_bill := public.resolve_host_billing_member(r.club_member_id, ch.club_id);
  SELECT name INTO v_payer_name FROM public.club_members WHERE id = p_payer;
  v_season := EXTRACT(YEAR FROM coalesce(ch.start_date, now()))::int;
  v_label := coalesce(ch.name, 'Tournament') || ' entry fee – paid by ' || coalesce(v_payer_name, 'partner');
  IF EXISTS (SELECT 1 FROM public.club_member_fee_payments
              WHERE club_member_id = v_bill AND fee_type = 'tournament_entry' AND fee_label = v_label AND season_year = v_season) THEN
    v_label := v_label || ' (' || coalesce(p_group, 0)::text || ')';
  END IF;
  INSERT INTO public.club_member_fee_payments
    (club_member_id, fee_type, fee_label, amount, paid, season_year, paid_by_member_id, champ_registration_id, champ_charge_key)
  VALUES (v_bill, 'tournament_entry', v_label, v_amount, false, v_season, p_payer, r.id, v_key)
  RETURNING id INTO v_id;
  UPDATE public.club_member_fee_payments SET paid = true, paid_at = now() WHERE id = v_id;
  INSERT INTO public.audit_events (club_id, actor_user_id, entity_type, entity_id, action, reason, after_data)
  VALUES (ch.club_id, auth.uid(), 'club_champs_registration', r.id, 'partner_cover_fee_recorded',
          'Partner entry fee paid by another player recorded under the partner',
          jsonb_build_object('fee_payment_id', v_id, 'amount', v_amount, 'payer_member_id', p_payer, 'group', p_group, 'payment_ref', p_ref));
  RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION public._champ_record_partner_cover_fee(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._champ_record_partner_cover_fee(uuid, integer, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.champ_mark_event_cover(p_partner_reg_id uuid, p_group integer, p_payer uuid, p_via text, p_ref text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  -- Money actually received for the partner: record it under the partner's name so the books show it.
  IF p_via <> 'account' THEN
    PERFORM public._champ_record_partner_cover_fee(p_partner_reg_id, p_group, p_payer, p_ref);
  END IF;
END $function$;