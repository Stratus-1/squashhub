ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS league_playoff_match_formats jsonb;
COMMENT ON COLUMN public.tournaments.league_playoff_match_formats IS 'Per-category playoff game count: bo3, bo5, all3, all5; absent inherits pool match format, independently of PAR.';
CREATE OR REPLACE FUNCTION public.validate_league_playoff_match_formats()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.league_playoff_match_formats IS NULL THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW.league_playoff_match_formats) <> 'object' THEN
    RAISE EXCEPTION 'Playoff match formats must be a category map';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(NEW.league_playoff_match_formats) e WHERE jsonb_typeof(e.value) <> 'string' OR e.value #>> '{}' NOT IN ('bo3','bo5','all3','all5')) THEN
    RAISE EXCEPTION 'Playoff match format must be bo3, bo5, all3 or all5';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_league_playoff_match_formats BEFORE INSERT OR UPDATE OF league_playoff_match_formats ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.validate_league_playoff_match_formats();