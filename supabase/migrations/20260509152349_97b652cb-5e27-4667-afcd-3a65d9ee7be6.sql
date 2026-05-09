-- Allow 'national' scope on league_associations
ALTER TABLE public.league_associations DROP CONSTRAINT IF EXISTS league_associations_scope_check;
ALTER TABLE public.league_associations ADD CONSTRAINT league_associations_scope_check
  CHECK (scope = ANY (ARRAY['internal'::text, 'region'::text, 'national'::text]));

-- Seed Squash South Africa as a national body fee for every club that doesn't have it
INSERT INTO public.national_body_fees (club_id, body_name, abbreviation, fee_annual, fee_due_month, due_day, fee_payable_to, fee_class, fee_type, active, pro_rate)
SELECT c.id, 'Squash South Africa', 'SSA', 300, 3, 31, 'Squash South Africa', 'pass_through', 'national', true, false
FROM public.clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM public.national_body_fees n
  WHERE n.club_id = c.id AND lower(n.abbreviation) = 'ssa'
);

-- Trigger: auto-seed SSA on every new club
CREATE OR REPLACE FUNCTION public.seed_ssa_national_body_fee()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.national_body_fees (club_id, body_name, abbreviation, fee_annual, fee_due_month, due_day, fee_payable_to, fee_class, fee_type, active, pro_rate)
  SELECT NEW.id, 'Squash South Africa', 'SSA', 300, 3, 31, 'Squash South Africa', 'pass_through', 'national', true, false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.national_body_fees n
    WHERE n.club_id = NEW.id AND lower(n.abbreviation) = 'ssa'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_ssa_national_body_fee ON public.clubs;
CREATE TRIGGER trg_seed_ssa_national_body_fee
AFTER INSERT ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.seed_ssa_national_body_fee();