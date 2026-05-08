
ALTER TABLE public.league_rules
  ALTER COLUMN league_id DROP NOT NULL,
  ALTER COLUMN club_id DROP NOT NULL,
  ADD COLUMN association_id uuid REFERENCES public.league_associations(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX uq_league_rules_association ON public.league_rules(association_id) WHERE association_id IS NOT NULL;

ALTER TABLE public.league_rules
  ADD CONSTRAINT chk_league_rules_scope CHECK (
    (league_id IS NOT NULL AND association_id IS NULL)
    OR (league_id IS NULL AND association_id IS NOT NULL)
  );

-- View policy: association rules visible to anyone authenticated; league rules to club members
DROP POLICY "Club members can view league rules" ON public.league_rules;
CREATE POLICY "View league rules"
  ON public.league_rules FOR SELECT
  USING (
    association_id IS NOT NULL
    OR (club_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.club_members cm WHERE cm.club_id = league_rules.club_id AND cm.user_id = auth.uid()
    ))
    OR public.has_role(auth.uid(), 'admin')
  );

-- Manage policy: association rules → global admin only; league rules → club admin
DROP POLICY "Club admins can manage league rules" ON public.league_rules;
CREATE POLICY "Manage league rules"
  ON public.league_rules FOR ALL
  USING (
    (association_id IS NOT NULL AND public.has_role(auth.uid(), 'admin'))
    OR (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), league_rules.club_id))
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    (association_id IS NOT NULL AND public.has_role(auth.uid(), 'admin'))
    OR (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), league_rules.club_id))
    OR public.has_role(auth.uid(), 'admin')
  );

-- Seed defaults for existing associations
INSERT INTO public.league_rules (association_id)
SELECT id FROM public.league_associations
WHERE NOT EXISTS (SELECT 1 FROM public.league_rules lr WHERE lr.association_id = league_associations.id);

-- Auto-seed for new associations
CREATE OR REPLACE FUNCTION public.seed_default_association_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.league_rules (association_id) VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_seed_default_association_rules
  AFTER INSERT ON public.league_associations
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_association_rules();
