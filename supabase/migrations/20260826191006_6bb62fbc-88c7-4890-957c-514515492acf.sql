CREATE TABLE public.app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id text NOT NULL UNIQUE,
  released_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal','critical')),
  rollout_percent integer NOT NULL DEFAULT 100 CHECK (rollout_percent BETWEEN 0 AND 100),
  target_club_ids uuid[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_releases TO anon;
GRANT SELECT ON public.app_releases TO authenticated;
GRANT ALL ON public.app_releases TO service_role;

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read release metadata"
ON public.app_releases FOR SELECT
USING (true);

CREATE POLICY "Platform admins manage releases"
ON public.app_releases FOR ALL
TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER app_releases_touch
BEFORE UPDATE ON public.app_releases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_app_releases_released_at ON public.app_releases (released_at DESC);