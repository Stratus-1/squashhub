-- Package pricing by number of categories entered ("tiered"): e.g. 1 category R200, 2 categories R300.
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS entry_fee_tiers jsonb;
COMMENT ON COLUMN public.tournaments.entry_fee_tiers IS 'Package prices in cents keyed by number of categories ("1","2",...); used only when entry_fee_basis = tiered. More categories than the last key pay the last key''s price.';

ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_entry_fee_basis_chk;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_entry_fee_basis_chk
  CHECK (entry_fee_basis IS NULL OR entry_fee_basis = ANY (ARRAY['per_player','per_category','tiered']));

CREATE OR REPLACE FUNCTION public.champ_tier_fee_cents(p_tiers jsonb, p_count integer)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF p_tiers IS NULL OR jsonb_typeof(p_tiers) <> 'object' OR coalesce(p_count, 0) <= 0 THEN RETURN 0; END IF;
  SELECT max(k::int) INTO n FROM jsonb_object_keys(p_tiers) k WHERE k ~ '^[0-9]+$';
  IF n IS NULL THEN RETURN 0; END IF;
  RETURN greatest(coalesce((p_tiers ->> least(p_count, n)::text)::int, 0), 0);
END $$;

-- Own amount due: tiered tournaments price by the number of categories the player pays for themselves.
CREATE OR REPLACE FUNCTION public.champ_reg_own_due_cents(p_reg_id uuid)
 RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r record; c record; t record; v_flat int; v_total int;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_reg_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO c FROM public.club_champs WHERE id = r.champ_id;
  SELECT division_fees, entry_fee_basis, entry_fee_tiers INTO t FROM public.tournaments WHERE id = r.champ_id;
  v_flat := coalesce(public.champ_entry_fee_cents(r.champ_id), coalesce(c.entry_fee_cents, 0));
  IF t.entry_fee_basis = 'tiered' AND t.entry_fee_tiers IS NOT NULL AND jsonb_typeof(t.entry_fee_tiers) = 'object'
     AND coalesce(public.champ_entry_fee_cents(r.champ_id), 0) > 0 THEN
    RETURN public.champ_tier_fee_cents(t.entry_fee_tiers, public.champ_reg_own_events(r.id));
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

CREATE OR REPLACE FUNCTION public.champ_registration_fee_breakdown(p_registration_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'event_fee_cents', coalesce(public.champ_entry_fee_cents(r.champ_id), 0),
    'events', cardinality(public.champ_reg_groups(r.division_choices)),
    'own_events', public.champ_reg_own_events(r.id),
    'own_due_cents', coalesce(public.champ_reg_own_due_cents(r.id), 0),
    'tiers', (SELECT CASE WHEN t.entry_fee_basis = 'tiered' THEN t.entry_fee_tiers END FROM public.tournaments t WHERE t.id = r.champ_id))
  FROM public.club_champs_registrations r
  WHERE r.id = p_registration_id
    AND (((public.is_club_admin(auth.uid(), (SELECT club_id FROM public.club_champs WHERE id = r.champ_id)) OR public.is_club_finance_writer(auth.uid(), (SELECT club_id FROM public.club_champs WHERE id = r.champ_id))) OR public.has_role(auth.uid(), 'admin'))
         OR EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = r.club_member_id AND m.user_id = auth.uid())
         OR public.member_is_delegate_of(r.club_member_id, auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION public.champ_registration_fee_lines(p_champ uuid)
 RETURNS TABLE(registration_id uuid, club_member_id uuid, division integer, amount_cents integer, charge_key text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t record; flat int; fees jsonb; mixed boolean;
BEGIN
  SELECT tt.entry_fee_basis, tt.entry_fee_mixed_rule, tt.division_fees, tt.entry_fee_tiers INTO t FROM public.tournaments tt WHERE tt.id = p_champ;
  SELECT coalesce(c.entry_fee_cents,0) INTO flat FROM public.club_champs c WHERE c.id = p_champ;
  fees := coalesce(t.division_fees, '{}'::jsonb);
  SELECT count(DISTINCT v) > 1 INTO mixed FROM jsonb_each_text(fees) e(k, v);
  IF t.entry_fee_basis IS NULL THEN RETURN; END IF;
  IF t.entry_fee_basis = 'tiered' THEN
    RETURN QUERY
      SELECT r.id, r.club_member_id, NULL::int,
             public.champ_tier_fee_cents(t.entry_fee_tiers, greatest(coalesce(cardinality(r.division_choices), 0), 1)),
             'champ:'||p_champ||':'||r.club_member_id||':person'
        FROM public.club_champs_registrations r
       WHERE r.champ_id = p_champ AND lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn');
  ELSIF t.entry_fee_basis = 'per_category' THEN
    RETURN QUERY
      SELECT r.id, r.club_member_id, d::int,
             coalesce((fees->>d::text)::int, flat),
             'champ:'||p_champ||':'||r.club_member_id||':cat'||d
        FROM public.club_champs_registrations r, unnest(coalesce(r.division_choices, ARRAY[]::int[])) d
       WHERE r.champ_id = p_champ AND lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn');
  ELSE
    IF mixed AND t.entry_fee_mixed_rule IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT r.id, r.club_member_id, NULL::int,
             CASE WHEN NOT mixed OR fees = '{}'::jsonb THEN coalesce((SELECT max(v::int) FROM jsonb_each_text(fees) e(k,v)), flat)
                  WHEN t.entry_fee_mixed_rule = 'highest' THEN coalesce((SELECT max((fees->>d::text)::int) FROM unnest(r.division_choices) d), flat)
                  ELSE coalesce((fees->>(r.division_choices[1])::text)::int, flat) END,
             'champ:'||p_champ||':'||r.club_member_id||':person'
        FROM public.club_champs_registrations r
       WHERE r.champ_id = p_champ AND lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn');
  END IF;
END $function$;

-- Setter gains the package prices (audited together with the basis).
DROP FUNCTION IF EXISTS public.champ_set_entry_fee_basis(uuid, text, text);
CREATE FUNCTION public.champ_set_entry_fee_basis(p_champ uuid, p_basis text, p_mixed_rule text, p_tiers jsonb DEFAULT NULL)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_old jsonb; v_n int; v_keys int;
BEGIN
  SELECT club_id, jsonb_build_object('basis', entry_fee_basis, 'mixed_rule', entry_fee_mixed_rule, 'tiers', entry_fee_tiers)
    INTO v_club, v_old FROM public.tournaments WHERE id = p_champ;
  IF NOT (public.is_club_admin(auth.uid(), v_club) OR public.is_club_finance_writer(auth.uid(), v_club)) THEN RAISE EXCEPTION 'not authorised'; END IF;
  IF p_basis = 'tiered' THEN
    IF p_tiers IS NULL OR jsonb_typeof(p_tiers) <> 'object' OR NOT (p_tiers ? '1') THEN
      RAISE EXCEPTION 'Enter the price for 1 category';
    END IF;
    SELECT max(k::int), count(*) INTO v_n, v_keys FROM jsonb_object_keys(p_tiers) k WHERE k ~ '^[1-9][0-9]*$';
    IF v_keys <> (SELECT count(*) FROM jsonb_object_keys(p_tiers)) OR v_n <> v_keys THEN
      RAISE EXCEPTION 'Package prices must be for 1, 2, 3 ... categories with no gaps';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(p_tiers) e WHERE jsonb_typeof(e.value) <> 'number' OR (e.value)::numeric < 0) THEN
      RAISE EXCEPTION 'Package prices must be zero or more';
    END IF;
  END IF;
  UPDATE public.tournaments SET entry_fee_basis = p_basis, entry_fee_mixed_rule = p_mixed_rule,
         entry_fee_tiers = CASE WHEN p_basis = 'tiered' THEN p_tiers ELSE entry_fee_tiers END,
         entry_fee_basis_set_at = now(), entry_fee_basis_set_by = auth.uid() WHERE id = p_champ;
  INSERT INTO public.audit_events (club_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (v_club, auth.uid(), 'champ_fee_basis_set', 'tournament', p_champ, v_old,
          jsonb_build_object('basis', p_basis, 'mixed_rule', p_mixed_rule, 'tiers', CASE WHEN p_basis = 'tiered' THEN p_tiers END));
END $function$;
REVOKE ALL ON FUNCTION public.champ_set_entry_fee_basis(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.champ_set_entry_fee_basis(uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.champ_tier_fee_cents(jsonb, integer) TO authenticated, service_role;
