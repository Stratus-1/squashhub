CREATE TABLE public.external_league_divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL REFERENCES public.league_associations(id) ON DELETE CASCADE,
  source text NOT NULL,
  external_division_id text NOT NULL,
  external_league_name text,
  division_name text NOT NULL,
  season_year integer,
  standings jsonb NOT NULL DEFAULT '[]'::jsonb,
  weekly jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_division_id)
);
GRANT SELECT ON public.external_league_divisions TO authenticated;
GRANT ALL ON public.external_league_divisions TO service_role;
ALTER TABLE public.external_league_divisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view external standings" ON public.external_league_divisions FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_external_league_divisions_updated_at BEFORE UPDATE ON public.external_league_divisions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS external_team_id text, ADD COLUMN IF NOT EXISTS external_division_id text;