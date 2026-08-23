CREATE TABLE public.league_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid REFERENCES public.league_associations(id) ON DELETE CASCADE,
  platform_association_id uuid REFERENCES public.platform_league_associations(id) ON DELETE CASCADE,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  season_year integer NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  is_current boolean NOT NULL DEFAULT false,
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_seasons_owner_chk CHECK (num_nonnulls(association_id, platform_association_id) = 1),
  CONSTRAINT league_seasons_status_chk CHECK (status IN ('planned','active','completed','archived')),
  CONSTRAINT league_seasons_year_chk CHECK (season_year BETWEEN 1900 AND 2200)
);

CREATE UNIQUE INDEX league_seasons_tenant_year_uidx ON public.league_seasons (association_id, season_year) WHERE association_id IS NOT NULL;
CREATE UNIQUE INDEX league_seasons_platform_year_uidx ON public.league_seasons (platform_association_id, season_year) WHERE platform_association_id IS NOT NULL;
CREATE UNIQUE INDEX league_seasons_tenant_current_uidx ON public.league_seasons (association_id) WHERE association_id IS NOT NULL AND is_current;
CREATE UNIQUE INDEX league_seasons_platform_current_uidx ON public.league_seasons (platform_association_id) WHERE platform_association_id IS NOT NULL AND is_current;
CREATE INDEX league_seasons_club_idx ON public.league_seasons (club_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_seasons TO authenticated;
GRANT ALL ON public.league_seasons TO service_role;

ALTER TABLE public.league_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view league seasons"
  ON public.league_seasons FOR SELECT TO authenticated USING (true);

CREATE POLICY "Club admins manage their league seasons"
  ON public.league_seasons FOR ALL TO authenticated
  USING (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Platform admins manage all league seasons"
  ON public.league_seasons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_league_seasons_updated_at
  BEFORE UPDATE ON public.league_seasons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.leagues ADD COLUMN season_id uuid REFERENCES public.league_seasons(id) ON DELETE SET NULL;
ALTER TABLE public.league_rounds ADD COLUMN season_id uuid REFERENCES public.league_seasons(id) ON DELETE SET NULL;
ALTER TABLE public.platform_league_fixtures ADD COLUMN season_id uuid REFERENCES public.league_seasons(id) ON DELETE SET NULL;

CREATE INDEX leagues_season_idx ON public.leagues (season_id);
CREATE INDEX league_rounds_season_idx ON public.league_rounds (season_id);
CREATE INDEX platform_league_fixtures_season_idx ON public.platform_league_fixtures (season_id);