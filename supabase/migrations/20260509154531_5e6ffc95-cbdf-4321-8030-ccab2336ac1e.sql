
CREATE OR REPLACE FUNCTION public.seed_member_default_fees(p_club_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member         public.club_members%ROWTYPE;
  v_club_id        uuid;
  v_is_nsa_club    boolean;
  v_cat_name       text;
  v_cat_amount     numeric;
  v_nsa_assoc      record;
  v_ssa_amount     numeric;
  v_nsa_levy       numeric;
  v_year           int := EXTRACT(year FROM now())::int;
BEGIN
  SELECT * INTO v_member FROM public.club_members WHERE id = p_club_member_id;
  IF NOT FOUND THEN RETURN; END IF;
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
    SELECT id, abbreviation, name INTO v_nsa_assoc
    FROM public.league_associations
    WHERE club_id = v_club_id AND abbreviation = 'NSA' LIMIT 1;

    SELECT amount INTO v_nsa_levy
    FROM public.club_fees_payable
    WHERE club_id = v_club_id
      AND payee_type = 'league_association'
      AND basis = 'per_member'
      AND COALESCE(active, true)
      AND (payee_name ILIKE '%NSA%' OR payee_name ILIKE '%Northern Squash%')
    ORDER BY amount DESC LIMIT 1;
    v_nsa_levy := COALESCE(v_nsa_levy, 160);

    INSERT INTO public.club_member_fee_payments
      (club_member_id, fee_type, fee_label, amount, paid, paid_at, season_year, is_pass_through)
    VALUES
      (p_club_member_id, 'association', COALESCE(v_nsa_assoc.abbreviation, 'NSA'),
       v_nsa_levy, true, now(), v_year, true)
    ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO NOTHING;

    SELECT fee_annual INTO v_ssa_amount
    FROM public.national_body_fees
    WHERE club_id = v_club_id AND abbreviation = 'SSA' AND COALESCE(active, true)
    LIMIT 1;
    v_ssa_amount := COALESCE(v_ssa_amount, 300);

    INSERT INTO public.club_member_fee_payments
      (club_member_id, fee_type, fee_label, amount, paid, paid_at, season_year, is_pass_through)
    VALUES
      (p_club_member_id, 'national', 'SSA', v_ssa_amount, true, now(), v_year, true)
    ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_seed_member_default_fees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_member_default_fees(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_member_default_fees_after_insert ON public.club_members;
CREATE TRIGGER trg_seed_member_default_fees_after_insert
AFTER INSERT ON public.club_members
FOR EACH ROW
EXECUTE FUNCTION public.trg_seed_member_default_fees();

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT cm.id
    FROM public.club_members cm
    WHERE EXISTS (
      SELECT 1 FROM public.league_associations la
      WHERE la.club_id = cm.club_id AND la.abbreviation = 'NSA' AND COALESCE(la.active, true)
    )
  LOOP
    PERFORM public.seed_member_default_fees(r.id);
  END LOOP;
END $$;
