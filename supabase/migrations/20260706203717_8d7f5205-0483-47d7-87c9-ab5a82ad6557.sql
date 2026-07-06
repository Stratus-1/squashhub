CREATE OR REPLACE FUNCTION public.seed_member_default_fees(p_club_member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member       public.club_members%ROWTYPE;
  v_club_id      uuid;
  v_is_nsa_club  boolean;
  v_cat_name     text;
  v_cat_amount   numeric;
  v_nsa_assoc    record;
  v_nsa_amount   numeric;
  v_ssa_amount   numeric;
  v_year         int := EXTRACT(year FROM now())::int;
  v_payable      record;
BEGIN
  SELECT * INTO v_member FROM public.club_members WHERE id = p_club_member_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Visitors never get auto-seeded league/national/club-payable fees.
  -- Cast enum role to text before COALESCE so the fallback is not parsed as an enum value.
  IF COALESCE(v_member.role::text, '') = 'visitor' THEN RETURN; END IF;

  v_club_id := v_member.club_id;

  SELECT EXISTS (
    SELECT 1 FROM public.league_associations
    WHERE club_id = v_club_id AND abbreviation = 'NSA' AND COALESCE(active, true)
  ) INTO v_is_nsa_club;
  IF NOT v_is_nsa_club THEN RETURN; END IF;

  IF v_member.fee_category_id IS NOT NULL THEN
    SELECT name, annual_fee INTO v_cat_name, v_cat_amount
    FROM public.member_fee_categories
    WHERE id = v_member.fee_category_id AND COALESCE(active, true);
    IF FOUND AND COALESCE(v_cat_amount, 0) > 0 THEN
      INSERT INTO public.club_member_fee_payments
        (club_member_id, fee_type, fee_label, amount, paid, paid_at, season_year)
      VALUES
        (p_club_member_id, 'club', 'Club – ' || v_cat_name, v_cat_amount, true, now(), v_year)
      ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO NOTHING;
    END IF;
  END IF;

  IF COALESCE(v_member.plays_league, false) THEN
    SELECT id, abbreviation, name, COALESCE(fee_annual, 0) AS fee_annual
      INTO v_nsa_assoc
    FROM public.league_associations
    WHERE club_id = v_club_id AND abbreviation = 'NSA' LIMIT 1;
    v_nsa_amount := COALESCE(v_nsa_assoc.fee_annual, 0);

    INSERT INTO public.club_member_fee_payments
      (club_member_id, fee_type, fee_label, amount, paid, paid_at, season_year, is_pass_through)
    VALUES
      (p_club_member_id, 'association', COALESCE(v_nsa_assoc.abbreviation, 'NSA'),
       v_nsa_amount, true, now(), v_year, true)
    ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO NOTHING;

    SELECT fee_annual INTO v_ssa_amount
    FROM public.national_body_fees
    WHERE club_id = v_club_id AND abbreviation = 'SSA' AND COALESCE(active, true)
    LIMIT 1;
    v_ssa_amount := COALESCE(v_ssa_amount, 0);

    INSERT INTO public.club_member_fee_payments
      (club_member_id, fee_type, fee_label, amount, paid, paid_at, season_year, is_pass_through)
    VALUES
      (p_club_member_id, 'national', 'SSA', v_ssa_amount, true, now(), v_year, true)
    ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO NOTHING;
  END IF;

  FOR v_payable IN
    SELECT id, payee_type, payee_name, amount
    FROM public.club_fees_payable
    WHERE club_id = v_club_id
      AND basis = 'per_member'
      AND COALESCE(active, true)
  LOOP
    INSERT INTO public.club_member_fee_payments
      (club_member_id, fee_type, fee_label, amount, paid, paid_at, season_year, is_pass_through)
    VALUES
      (p_club_member_id,
       CASE WHEN v_payable.payee_type = 'national_body'
            THEN 'club_payable_national'
            ELSE 'club_payable_assoc' END,
       v_payable.payee_name,
       COALESCE(v_payable.amount, 0),
       true, now(), v_year, true)
    ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO NOTHING;
  END LOOP;
END;
$function$;