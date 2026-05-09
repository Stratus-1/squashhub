
-- 1) Update seed function: NSA amount comes from league_associations.fee_annual
CREATE OR REPLACE FUNCTION public.seed_member_default_fees(p_club_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  SELECT * INTO v_member FROM public.club_members WHERE id = p_club_member_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_club_id := v_member.club_id;

  SELECT EXISTS (
    SELECT 1 FROM public.league_associations
    WHERE club_id = v_club_id AND abbreviation = 'NSA' AND COALESCE(active, true)
  ) INTO v_is_nsa_club;
  IF NOT v_is_nsa_club THEN RETURN; END IF;

  -- Club category fee (membership)
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
    -- NSA receivable: use league_associations.fee_annual (the amount the club charges members)
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

    -- SSA receivable: from national_body_fees.fee_annual
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
END;
$$;

-- 2) Trigger that propagates fee_annual / annual_fee changes to existing
--    seeded member payment rows so admins editing the fee schedule
--    immediately see the new amount on every member.
CREATE OR REPLACE FUNCTION public.sync_member_fee_amount_from_league_assoc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.fee_annual IS DISTINCT FROM OLD.fee_annual THEN
    UPDATE public.club_member_fee_payments p
    SET amount = COALESCE(NEW.fee_annual, 0)
    FROM public.club_members cm
    WHERE p.club_member_id = cm.id
      AND cm.club_id = NEW.club_id
      AND p.fee_type = 'association'
      AND p.fee_label = COALESCE(NEW.abbreviation, p.fee_label);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_member_fee_amount_from_league_assoc ON public.league_associations;
CREATE TRIGGER trg_sync_member_fee_amount_from_league_assoc
AFTER UPDATE ON public.league_associations
FOR EACH ROW EXECUTE FUNCTION public.sync_member_fee_amount_from_league_assoc();

CREATE OR REPLACE FUNCTION public.sync_member_fee_amount_from_national_body()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.fee_annual IS DISTINCT FROM OLD.fee_annual THEN
    UPDATE public.club_member_fee_payments p
    SET amount = COALESCE(NEW.fee_annual, 0)
    FROM public.club_members cm
    WHERE p.club_member_id = cm.id
      AND cm.club_id = NEW.club_id
      AND p.fee_type = 'national'
      AND p.fee_label = COALESCE(NEW.abbreviation, p.fee_label);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_member_fee_amount_from_national_body ON public.national_body_fees;
CREATE TRIGGER trg_sync_member_fee_amount_from_national_body
AFTER UPDATE ON public.national_body_fees
FOR EACH ROW EXECUTE FUNCTION public.sync_member_fee_amount_from_national_body();

CREATE OR REPLACE FUNCTION public.sync_member_fee_amount_from_category()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.annual_fee IS DISTINCT FROM OLD.annual_fee THEN
    UPDATE public.club_member_fee_payments p
    SET amount = COALESCE(NEW.annual_fee, 0)
    FROM public.club_members cm
    WHERE p.club_member_id = cm.id
      AND cm.fee_category_id = NEW.id
      AND p.fee_type = 'club'
      AND p.fee_label = 'Club – ' || NEW.name;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_member_fee_amount_from_category ON public.member_fee_categories;
CREATE TRIGGER trg_sync_member_fee_amount_from_category
AFTER UPDATE ON public.member_fee_categories
FOR EACH ROW EXECUTE FUNCTION public.sync_member_fee_amount_from_category();

-- 3) Backfill: realign every existing NSA / SSA / category row to its
--    current receivable amount (so prior R160 levy values get corrected).
UPDATE public.club_member_fee_payments p
SET amount = COALESCE(la.fee_annual, 0)
FROM public.club_members cm
JOIN public.league_associations la
  ON la.club_id = cm.club_id AND la.abbreviation = 'NSA'
WHERE p.club_member_id = cm.id
  AND p.fee_type = 'association'
  AND p.fee_label = 'NSA';

UPDATE public.club_member_fee_payments p
SET amount = COALESCE(nb.fee_annual, 0)
FROM public.club_members cm
JOIN public.national_body_fees nb
  ON nb.club_id = cm.club_id AND nb.abbreviation = 'SSA'
WHERE p.club_member_id = cm.id
  AND p.fee_type = 'national'
  AND p.fee_label = 'SSA';

UPDATE public.club_member_fee_payments p
SET amount = COALESCE(c.annual_fee, 0)
FROM public.club_members cm
JOIN public.member_fee_categories c
  ON c.id = cm.fee_category_id
WHERE p.club_member_id = cm.id
  AND p.fee_type = 'club'
  AND p.fee_label = 'Club – ' || c.name;
