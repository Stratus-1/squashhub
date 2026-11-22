ALTER TABLE public.club_fees_payable
  ADD COLUMN IF NOT EXISTS season_year integer NOT NULL
  DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'Africa/Johannesburg')))::integer;
COMMENT ON COLUMN public.club_fees_payable.season_year IS 'Season the payable rate applies to; earlier seasons are kept read-only as the audit trail.';
CREATE INDEX IF NOT EXISTS club_fees_payable_club_season_idx ON public.club_fees_payable (club_id, season_year);

CREATE OR REPLACE FUNCTION public.seed_nsa_payable_fees()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.abbreviation = 'NSA' OR NEW.name ILIKE 'Northern Squash Association%' THEN
    INSERT INTO public.club_fees_payable
      (club_id, payee_type, payee_name, payee_ref_id, basis, amount, due_month, due_day, notes, active, season_year)
    SELECT NEW.club_id, 'league_association', 'Northern Squash Association', NEW.id,
           'per_team', 2600, 2, 28, 'NSA 2026 League fees @ R2600 per team. Invoices sent 28 Feb each year.', true, 2026
    WHERE NOT EXISTS (
      SELECT 1 FROM public.club_fees_payable f
      WHERE f.club_id = NEW.club_id AND f.payee_name = 'Northern Squash Association' AND f.basis = 'per_team'
    );

    INSERT INTO public.club_fees_payable
      (club_id, payee_type, payee_name, payee_ref_id, basis, amount, due_month, due_day, notes, active, season_year)
    SELECT NEW.club_id, 'league_association', 'Northern Squash Association', NEW.id,
           'per_member', 160, 2, 28, 'NSA 2026 Player Levy @ R160 per player. Invoices sent 28 Feb each year.', true, 2026
    WHERE NOT EXISTS (
      SELECT 1 FROM public.club_fees_payable f
      WHERE f.club_id = NEW.club_id AND f.payee_name = 'Northern Squash Association' AND f.basis = 'per_member' AND f.amount = 160
    );

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

ALTER TABLE public.member_fee_categories ADD COLUMN IF NOT EXISTS rate_season_year integer;
ALTER TABLE public.league_associations ADD COLUMN IF NOT EXISTS rate_season_year integer;
ALTER TABLE public.national_body_fees ADD COLUMN IF NOT EXISTS rate_season_year integer;
COMMENT ON COLUMN public.member_fee_categories.rate_season_year IS 'Season from which the current amount applies (fee history).';
COMMENT ON COLUMN public.league_associations.rate_season_year IS 'Season from which the current fee amount applies (fee history).';
COMMENT ON COLUMN public.national_body_fees.rate_season_year IS 'Season from which the current amount applies (fee history).';

CREATE TABLE public.club_fee_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  fee_source text NOT NULL CHECK (fee_source IN ('member_fee_categories','league_associations','national_body_fees')),
  fee_id uuid NOT NULL,
  fee_name text,
  fee_kind text,
  amount numeric,
  previous_amount numeric,
  season_year integer NOT NULL,
  change_kind text NOT NULL CHECK (change_kind IN ('baseline','added','changed','removed')),
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.club_fee_rate_history TO authenticated;
GRANT ALL ON public.club_fee_rate_history TO service_role;
ALTER TABLE public.club_fee_rate_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fee managers read fee history" ON public.club_fee_rate_history
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'fees'::text)
    OR public.is_club_finance_writer(auth.uid(), club_id)
  );
CREATE INDEX club_fee_rate_history_club_idx ON public.club_fee_rate_history (club_id, season_year, changed_at);

CREATE OR REPLACE FUNCTION public.track_fee_rate_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  amt_col text := CASE WHEN TG_TABLE_NAME = 'member_fee_categories' THEN 'annual_fee' ELSE 'fee_annual' END;
  name_col text := CASE WHEN TG_TABLE_NAME = 'national_body_fees' THEN 'body_name' ELSE 'name' END;
  cur_year int := EXTRACT(year FROM (now() AT TIME ZONE 'Africa/Johannesburg'))::int;
  n jsonb; o jsonb; r jsonb;
  kind text; yr int;
  who uuid := auth.uid();
  who_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    n := to_jsonb(NEW); r := n; kind := 'added';
  ELSIF TG_OP = 'UPDATE' THEN
    n := to_jsonb(NEW); o := to_jsonb(OLD); r := n;
    IF (n->>amt_col)::numeric IS NOT DISTINCT FROM (o->>amt_col)::numeric THEN
      RETURN NEW;
    END IF;
    kind := 'changed';
  ELSE
    o := to_jsonb(OLD); r := o; kind := 'removed';
  END IF;

  IF kind = 'removed' THEN
    yr := cur_year;
  ELSE
    yr := GREATEST(COALESCE(NULLIF(r->>'rate_season_year','')::int, cur_year), cur_year);
  END IF;

  IF who IS NOT NULL THEN
    SELECT cm.name INTO who_name FROM public.club_members cm
     WHERE cm.user_id = who AND cm.club_id = (r->>'club_id')::uuid
     LIMIT 1;
  END IF;

  INSERT INTO public.club_fee_rate_history
    (club_id, fee_source, fee_id, fee_name, fee_kind, amount, previous_amount, season_year, change_kind, changed_by, changed_by_name)
  VALUES (
    (r->>'club_id')::uuid, TG_TABLE_NAME, (r->>'id')::uuid, r->>name_col,
    CASE TG_TABLE_NAME WHEN 'member_fee_categories' THEN 'membership' WHEN 'league_associations' THEN 'league' ELSE COALESCE(r->>'fee_type','national') END,
    CASE WHEN kind = 'removed' THEN NULL ELSE (n->>amt_col)::numeric END,
    CASE WHEN o IS NULL THEN NULL ELSE (o->>amt_col)::numeric END,
    yr, kind, who, who_name
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.track_fee_rate_history() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_member_fee_categories_rate_history
  AFTER INSERT OR UPDATE OF annual_fee OR DELETE ON public.member_fee_categories
  FOR EACH ROW EXECUTE FUNCTION public.track_fee_rate_history();
CREATE TRIGGER trg_league_associations_rate_history
  AFTER INSERT OR UPDATE OF fee_annual OR DELETE ON public.league_associations
  FOR EACH ROW EXECUTE FUNCTION public.track_fee_rate_history();
CREATE TRIGGER trg_national_body_fees_rate_history
  AFTER INSERT OR UPDATE OF fee_annual OR DELETE ON public.national_body_fees
  FOR EACH ROW EXECUTE FUNCTION public.track_fee_rate_history();

INSERT INTO public.club_fee_rate_history (club_id, fee_source, fee_id, fee_name, fee_kind, amount, season_year, change_kind)
SELECT club_id, 'member_fee_categories', id, name, 'membership', annual_fee, 2026, 'baseline' FROM public.member_fee_categories;
INSERT INTO public.club_fee_rate_history (club_id, fee_source, fee_id, fee_name, fee_kind, amount, season_year, change_kind)
SELECT club_id, 'league_associations', id, name, 'league', fee_annual, 2026, 'baseline' FROM public.league_associations;
INSERT INTO public.club_fee_rate_history (club_id, fee_source, fee_id, fee_name, fee_kind, amount, season_year, change_kind)
SELECT club_id, 'national_body_fees', id, body_name, COALESCE(fee_type,'national'), fee_annual, 2026, 'baseline' FROM public.national_body_fees;