
-- Extend seed_member_default_fees to also insert "club payable per member" rows
-- for NSA & SSA (basis='per_member' from club_fees_payable). These represent
-- what the CLUB owes per member; default state = paid.

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

  -- NEW: "Fees paid in respect of" — what the CLUB pays per member.
  -- Pull from club_fees_payable where basis='per_member' AND active.
  -- Default state = paid (assumed remitted). Excludes per_club / per_team.
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

-- Backfill: seed for every existing member of NSA-affiliated clubs
DO $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT cm.id
    FROM public.club_members cm
    WHERE EXISTS (
      SELECT 1 FROM public.league_associations la
      WHERE la.club_id = cm.club_id
        AND la.abbreviation = 'NSA'
        AND COALESCE(la.active, true)
    )
  LOOP
    PERFORM public.seed_member_default_fees(v_id);
  END LOOP;
END $$;

-- Trigger: when a club_fees_payable amount changes, propagate to existing
-- club_member_fee_payments for that club + payee.
CREATE OR REPLACE FUNCTION public.sync_member_fee_from_club_payable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fee_type text;
BEGIN
  IF NEW.basis <> 'per_member' THEN RETURN NEW; END IF;
  v_fee_type := CASE WHEN NEW.payee_type = 'national_body'
                     THEN 'club_payable_national'
                     ELSE 'club_payable_assoc' END;

  UPDATE public.club_member_fee_payments p
  SET amount = COALESCE(NEW.amount, 0)
  WHERE p.fee_type = v_fee_type
    AND p.fee_label = NEW.payee_name
    AND p.club_member_id IN (
      SELECT id FROM public.club_members WHERE club_id = NEW.club_id
    );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_member_fee_from_club_payable ON public.club_fees_payable;
CREATE TRIGGER trg_sync_member_fee_from_club_payable
AFTER UPDATE OF amount, payee_name ON public.club_fees_payable
FOR EACH ROW EXECUTE FUNCTION public.sync_member_fee_from_club_payable();
