-- 1. Extend basis check to include per_team
ALTER TABLE public.club_fees_payable DROP CONSTRAINT IF EXISTS club_fees_payable_basis_check;
ALTER TABLE public.club_fees_payable ADD CONSTRAINT club_fees_payable_basis_check
  CHECK (basis = ANY (ARRAY['per_member'::text, 'per_club'::text, 'per_team'::text]));

-- 2. Seed standard NSA + SSA fees for every NSA-affiliated club
WITH nsa_clubs AS (
  SELECT DISTINCT la.club_id, la.id AS league_association_id
  FROM public.league_associations la
  WHERE la.abbreviation = 'NSA' OR la.name ILIKE 'Northern Squash Association%'
)
INSERT INTO public.club_fees_payable
  (club_id, payee_type, payee_name, payee_ref_id, basis, amount, due_month, due_day, notes, active)
SELECT c.club_id, 'league_association', 'Northern Squash Association', c.league_association_id,
       'per_team', 2600, 2, 28, 'NSA 2026 League fees @ R2600 per team. Invoices sent 28 Feb each year.', true
FROM nsa_clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_fees_payable f
  WHERE f.club_id = c.club_id AND f.payee_name = 'Northern Squash Association' AND f.basis = 'per_team'
);

WITH nsa_clubs AS (
  SELECT DISTINCT la.club_id, la.id AS league_association_id
  FROM public.league_associations la
  WHERE la.abbreviation = 'NSA' OR la.name ILIKE 'Northern Squash Association%'
)
INSERT INTO public.club_fees_payable
  (club_id, payee_type, payee_name, payee_ref_id, basis, amount, due_month, due_day, notes, active)
SELECT c.club_id, 'league_association', 'Northern Squash Association', c.league_association_id,
       'per_member', 160, 2, 28, 'NSA 2026 Player Levy @ R160 per player. Invoices sent 28 Feb each year.', true
FROM nsa_clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_fees_payable f
  WHERE f.club_id = c.club_id AND f.payee_name = 'Northern Squash Association' AND f.basis = 'per_member' AND f.amount = 160
);

WITH nsa_clubs AS (
  SELECT DISTINCT la.club_id
  FROM public.league_associations la
  WHERE la.abbreviation = 'NSA' OR la.name ILIKE 'Northern Squash Association%'
)
INSERT INTO public.club_fees_payable
  (club_id, payee_type, payee_name, payee_ref_id, basis, amount, due_month, due_day, notes, active)
SELECT c.club_id, 'national_body', 'Squash South Africa', NULL,
       'per_member', 300, 3, 31, 'SSA membership @ R300 per member per year. Payable 31 March each year.', true
FROM nsa_clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_fees_payable f
  WHERE f.club_id = c.club_id AND f.payee_name = 'Squash South Africa'
);

-- 3. Trigger to auto-add these three fees whenever a new NSA league_associations row is created
CREATE OR REPLACE FUNCTION public.seed_nsa_payable_fees()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.abbreviation = 'NSA' OR NEW.name ILIKE 'Northern Squash Association%' THEN
    -- League fee per team
    INSERT INTO public.club_fees_payable
      (club_id, payee_type, payee_name, payee_ref_id, basis, amount, due_month, due_day, notes, active)
    SELECT NEW.club_id, 'league_association', 'Northern Squash Association', NEW.id,
           'per_team', 2600, 2, 28, 'NSA 2026 League fees @ R2600 per team. Invoices sent 28 Feb each year.', true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.club_fees_payable f
      WHERE f.club_id = NEW.club_id AND f.payee_name = 'Northern Squash Association' AND f.basis = 'per_team'
    );

    -- Player levy per member
    INSERT INTO public.club_fees_payable
      (club_id, payee_type, payee_name, payee_ref_id, basis, amount, due_month, due_day, notes, active)
    SELECT NEW.club_id, 'league_association', 'Northern Squash Association', NEW.id,
           'per_member', 160, 2, 28, 'NSA 2026 Player Levy @ R160 per player. Invoices sent 28 Feb each year.', true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.club_fees_payable f
      WHERE f.club_id = NEW.club_id AND f.payee_name = 'Northern Squash Association' AND f.basis = 'per_member' AND f.amount = 160
    );

    -- SSA per member
    INSERT INTO public.club_fees_payable
      (club_id, payee_type, payee_name, payee_ref_id, basis, amount, due_month, due_day, notes, active)
    SELECT NEW.club_id, 'national_body', 'Squash South Africa', NULL,
           'per_member', 300, 3, 31, 'SSA membership @ R300 per member per year. Payable 31 March each year.', true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.club_fees_payable f
      WHERE f.club_id = NEW.club_id AND f.payee_name = 'Squash South Africa'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_nsa_payable_fees ON public.league_associations;
CREATE TRIGGER trg_seed_nsa_payable_fees
AFTER INSERT ON public.league_associations
FOR EACH ROW
EXECUTE FUNCTION public.seed_nsa_payable_fees();