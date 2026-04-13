ALTER TABLE public.league_associations
ADD COLUMN platform_association_id uuid REFERENCES public.platform_league_associations(id) ON DELETE SET NULL DEFAULT NULL;