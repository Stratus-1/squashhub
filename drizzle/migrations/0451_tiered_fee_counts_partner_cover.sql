CREATE OR REPLACE FUNCTION public.champ_reg_own_due_cents(p_reg_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; c record; t record; v_flat int; v_total int; v_all int; v_own int;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_reg_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO c FROM public.club_champs WHERE id = r.champ_id;
  SELECT division_fees, entry_fee_basis, entry_fee_tiers INTO t FROM public.tournaments WHERE id = r.champ_id;
  v_flat := coalesce(public.champ_entry_fee_cents(r.champ_id), coalesce(c.entry_fee_cents, 0));
  IF t.entry_fee_basis = 'tiered' AND t.entry_fee_tiers IS NOT NULL AND jsonb_typeof(t.entry_fee_tiers) = 'object'
     AND coalesce(public.champ_entry_fee_cents(r.champ_id), 0) > 0 THEN
    -- Package price for every event the player entered, less the one-event fee a partner
    -- pays for each event they cover (e.g. 2 events R310, partner covered one at R210 → R100).
    v_all := coalesce(array_length(public.champ_reg_groups(r.division_choices), 1), 0);
    v_own := public.champ_reg_own_events(r.id);
    IF v_own >= v_all THEN
      RETURN public.champ_tier_fee_cents(t.entry_fee_tiers, v_own);
    END IF;
    RETURN greatest(public.champ_tier_fee_cents(t.entry_fee_tiers, v_all)
                    - (v_all - v_own) * public.champ_tier_fee_cents(t.entry_fee_tiers, 1), 0);
  END IF;
  IF coalesce(c.payment_required, false)
     AND t.division_fees IS NOT NULL
     AND t.division_fees <> 'null'::jsonb THEN
    SELECT coalesce(sum(coalesce((t.division_fees ->> g::text)::int, v_flat)), 0) INTO v_total
      FROM unnest(public.champ_reg_groups(r.division_choices)) g
     WHERE NOT public.champ_event_covered_by_other(r.id, g);
    RETURN v_total;
  END IF;
  RETURN v_flat * public.champ_reg_own_events(r.id);
END;
$function$;