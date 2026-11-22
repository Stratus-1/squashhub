CREATE OR REPLACE FUNCTION public.seed_nsa_payable_fees()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- NSA rates are read from NSA's own schedule (association_fee_items via club_association_statement);
  -- clubs no longer get typed copies, which drifted out of sync.
  IF NEW.abbreviation = 'NSA' OR NEW.name ILIKE 'Northern Squash Association%' THEN
    INSERT INTO public.club_fees_payable
      (club_id, payee_type, payee_name, payee_ref_id, basis, amount, due_month, due_day, notes, active, season_year)
    SELECT NEW.club_id, 'national_body', 'Squash South Africa', NULL,
           'per_member', 300, 3, 31, 'SSA membership @ R300 per member per year. Payable 31 March each year.', true, 2026
    WHERE NOT EXISTS (
      SELECT 1 FROM public.club_fees_payable f
      WHERE f.club_id = NEW.club_id AND f.payee_name = 'Squash South Africa'
    );
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.seed_nsa_payable_fees() IS 'Seeds the SSA starter payable row for NSA-linked clubs; NSA rates are never copied into clubs (read from NSA''s schedule).';