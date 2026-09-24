CREATE TABLE public.club_beta_features (
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (feature IN ('tournament_beta')),
  enabled_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, feature)
);
GRANT SELECT, INSERT, DELETE ON public.club_beta_features TO authenticated;
GRANT ALL ON public.club_beta_features TO service_role;
ALTER TABLE public.club_beta_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read beta flags" ON public.club_beta_features FOR SELECT TO authenticated USING (true);
CREATE POLICY "Platform admins manage beta flags" ON public.club_beta_features FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.can_use_tournament_beta(_user_id uuid, _club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(_user_id)
    OR (_club_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.club_beta_features f WHERE f.club_id = _club_id AND f.feature = 'tournament_beta')
        AND public.is_club_admin_or_permitted(_user_id, _club_id, 'champs'));
$$;

CREATE POLICY "Beta clubs manage own smart drafts" ON public.smart_tournament_drafts FOR ALL TO authenticated
  USING (owner_kind = 'club' AND public.can_use_tournament_beta(auth.uid(), owner_id))
  WITH CHECK (owner_kind = 'club' AND public.can_use_tournament_beta(auth.uid(), owner_id));

INSERT INTO public.club_beta_features (club_id, feature, enabled_by)
VALUES ('11111111-1111-1111-1111-111111111111', 'tournament_beta', NULL) ON CONFLICT DO NOTHING;