ALTER TABLE public.league_rules DROP CONSTRAINT IF EXISTS league_rules_association_id_fkey;

CREATE OR REPLACE FUNCTION public.league_rules_validate_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.association_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_league_associations p WHERE p.id = NEW.association_id)
     OR EXISTS (SELECT 1 FROM public.league_associations la WHERE la.id = NEW.association_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'league_rules.association_id % does not match any league association', NEW.association_id;
END;
$$;

DROP TRIGGER IF EXISTS trg_league_rules_validate_association ON public.league_rules;
CREATE TRIGGER trg_league_rules_validate_association
BEFORE INSERT OR UPDATE ON public.league_rules
FOR EACH ROW EXECUTE FUNCTION public.league_rules_validate_association();