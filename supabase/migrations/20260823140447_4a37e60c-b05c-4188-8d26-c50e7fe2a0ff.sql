CREATE OR REPLACE FUNCTION public.set_tenant_season_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.season_id IS NULL AND NEW.association_id IS NOT NULL THEN
    SELECT id INTO NEW.season_id
    FROM public.league_seasons
    WHERE association_id = NEW.association_id AND is_current
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_platform_season_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.season_id IS NULL AND NEW.association_id IS NOT NULL THEN
    SELECT id INTO NEW.season_id
    FROM public.league_seasons
    WHERE platform_association_id = NEW.association_id AND is_current
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_rounds_season_default ON public.league_rounds;
CREATE TRIGGER league_rounds_season_default
BEFORE INSERT ON public.league_rounds
FOR EACH ROW EXECUTE FUNCTION public.set_tenant_season_default();

DROP TRIGGER IF EXISTS leagues_season_default ON public.leagues;
CREATE TRIGGER leagues_season_default
BEFORE INSERT ON public.leagues
FOR EACH ROW EXECUTE FUNCTION public.set_tenant_season_default();

DROP TRIGGER IF EXISTS platform_league_fixtures_season_default ON public.platform_league_fixtures;
CREATE TRIGGER platform_league_fixtures_season_default
BEFORE INSERT ON public.platform_league_fixtures
FOR EACH ROW EXECUTE FUNCTION public.set_platform_season_default();