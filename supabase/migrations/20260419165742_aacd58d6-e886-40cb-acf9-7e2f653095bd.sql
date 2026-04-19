-- 1) Add tenant_type to clubs
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS tenant_type text NOT NULL DEFAULT 'club';

ALTER TABLE public.clubs
  DROP CONSTRAINT IF EXISTS clubs_tenant_type_check;

ALTER TABLE public.clubs
  ADD CONSTRAINT clubs_tenant_type_check
  CHECK (tenant_type IN ('club', 'association'));

CREATE INDEX IF NOT EXISTS idx_clubs_tenant_type ON public.clubs(tenant_type);

-- 2) Affiliated clubs join table (associations <-> clubs)
CREATE TABLE IF NOT EXISTS public.association_affiliated_clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_tenant_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (association_tenant_id, club_id),
  CONSTRAINT no_self_affiliation CHECK (association_tenant_id <> club_id),
  CONSTRAINT affiliation_status_check CHECK (status IN ('active', 'pending', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_aac_association ON public.association_affiliated_clubs(association_tenant_id);
CREATE INDEX IF NOT EXISTS idx_aac_club ON public.association_affiliated_clubs(club_id);

ALTER TABLE public.association_affiliated_clubs ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view affiliations they're part of (either side)
CREATE POLICY "View affiliations as member of either side"
  ON public.association_affiliated_clubs
  FOR SELECT
  TO authenticated
  USING (
    public.is_club_member(auth.uid(), association_tenant_id)
    OR public.is_club_member(auth.uid(), club_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Only association admins can create
CREATE POLICY "Association admins can create affiliations"
  ON public.association_affiliated_clubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_club_admin(auth.uid(), association_tenant_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Both sides' admins can update affiliation status
CREATE POLICY "Affiliation admins can update"
  ON public.association_affiliated_clubs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_club_admin(auth.uid(), association_tenant_id)
    OR public.is_club_admin(auth.uid(), club_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Only association admins can delete
CREATE POLICY "Association admins can delete affiliations"
  ON public.association_affiliated_clubs
  FOR DELETE
  TO authenticated
  USING (
    public.is_club_admin(auth.uid(), association_tenant_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER trg_aac_updated_at
  BEFORE UPDATE ON public.association_affiliated_clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Link league_associations to platform association tenant
ALTER TABLE public.league_associations
  ADD COLUMN IF NOT EXISTS platform_association_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_la_platform_assoc ON public.league_associations(platform_association_id);
