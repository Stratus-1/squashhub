CREATE OR REPLACE FUNCTION public.seed_nsa_payable_fees()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- NSA and SSA rates are read from each body's own schedule
  -- (association_fee_items / national_body_fee_schedule); clubs never get typed copies.
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.seed_nsa_payable_fees() IS 'No-op: association and national-body rates are never copied into clubs; they are read from the body''s own season schedule.';

INSERT INTO public.national_body_fee_schedule (organisation_id, season_year, basis, label, amount, due_month, due_day, notes)
SELECT '429c693b-f042-4767-b22e-52b9ef732789', 2026, 'per_member', 'Per member fee', 300.00, 3, 31, 'SSA 2026 fee payable by clubs'
WHERE NOT EXISTS (
  SELECT 1 FROM public.national_body_fee_schedule s
  WHERE s.organisation_id = '429c693b-f042-4767-b22e-52b9ef732789' AND s.season_year = 2026 AND s.basis = 'per_member'
);