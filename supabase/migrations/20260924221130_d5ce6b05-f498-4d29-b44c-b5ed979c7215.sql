-- Structural records for structured-architecture (Beta) tournaments. Additive only.
CREATE TABLE public.tournament_divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  spec_key text NOT NULL,
  label text NOT NULL,
  unit text NOT NULL DEFAULT 'players' CHECK (unit IN ('players','pairs','teams')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, spec_key)
);
CREATE TABLE public.tournament_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  division_id uuid NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  spec_key text NOT NULL,
  label text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('round_robin','pools','knockout','swiss','placement')),
  stage_order integer NOT NULL,
  generation text NOT NULL DEFAULT 'owner_approval' CHECK (generation IN ('automatic','owner_approval')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (division_id, spec_key),
  UNIQUE (division_id, stage_order)
);
CREATE TABLE public.tournament_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.tournament_stages(id) ON DELETE CASCADE,
  pool_index integer NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_id, pool_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_divisions, public.tournament_stages, public.tournament_pools TO authenticated;
GRANT ALL ON public.tournament_divisions, public.tournament_stages, public.tournament_pools TO service_role;
ALTER TABLE public.tournament_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view divisions" ON public.tournament_divisions FOR SELECT TO authenticated USING (public.can_view_tournament(auth.uid(), tournament_id));
CREATE POLICY "manage divisions" ON public.tournament_divisions FOR ALL TO authenticated USING (public.can_manage_tournament(auth.uid(), tournament_id)) WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id));
CREATE POLICY "view stages" ON public.tournament_stages FOR SELECT TO authenticated USING (public.can_view_tournament(auth.uid(), tournament_id));
CREATE POLICY "manage stages" ON public.tournament_stages FOR ALL TO authenticated USING (public.can_manage_tournament(auth.uid(), tournament_id)) WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id));
CREATE POLICY "view pools" ON public.tournament_pools FOR SELECT TO authenticated USING (public.can_view_tournament(auth.uid(), tournament_id));
CREATE POLICY "manage pools" ON public.tournament_pools FOR ALL TO authenticated USING (public.can_manage_tournament(auth.uid(), tournament_id)) WITH CHECK (public.can_manage_tournament(auth.uid(), tournament_id));

CREATE TRIGGER trg_tdiv_updated BEFORE UPDATE ON public.tournament_divisions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tstage_updated BEFORE UPDATE ON public.tournament_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tpool_updated BEFORE UPDATE ON public.tournament_pools FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Nullable references on existing rounds/matches (legacy rows stay NULL).
ALTER TABLE public.club_champs_rounds
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.tournament_stages(id) ON DELETE CASCADE;
ALTER TABLE public.club_champs_matches
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES public.tournament_divisions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.tournament_stages(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pool_id uuid REFERENCES public.tournament_pools(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_ccm_stage ON public.club_champs_matches(stage_id) WHERE stage_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ccr_stage ON public.club_champs_rounds(stage_id) WHERE stage_id IS NOT NULL;

-- Identity guard: enforced only for tournaments with builder_architecture = 'structured'.
CREATE OR REPLACE FUNCTION public.guard_structured_match_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE arch text; st record; rd record; pl record;
BEGIN
  SELECT builder_architecture INTO arch FROM tournaments WHERE id = NEW.champ_id;
  IF arch IS DISTINCT FROM 'structured' THEN RETURN NEW; END IF;
  IF NEW.division_id IS NULL OR NEW.stage_id IS NULL OR NEW.round_id IS NULL THEN
    RAISE EXCEPTION 'Structured tournament game needs division, stage and round' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO st FROM tournament_stages WHERE id = NEW.stage_id;
  IF st.tournament_id <> NEW.champ_id OR st.division_id <> NEW.division_id THEN
    RAISE EXCEPTION 'Stage does not belong to this division/tournament' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO rd FROM club_champs_rounds WHERE id = NEW.round_id;
  IF rd.champ_id <> NEW.champ_id OR rd.stage_id IS DISTINCT FROM NEW.stage_id THEN
    RAISE EXCEPTION 'Round does not belong to this stage' USING ERRCODE = '23514';
  END IF;
  IF st.kind IN ('knockout','placement') THEN
    IF NEW.pool_id IS NOT NULL THEN RAISE EXCEPTION 'Knockout/playoff games never belong to a pool' USING ERRCODE = '23514'; END IF;
  ELSIF st.kind = 'pools' THEN
    IF NEW.pool_id IS NULL THEN RAISE EXCEPTION 'Pool-stage game needs a pool' USING ERRCODE = '23514'; END IF;
    SELECT * INTO pl FROM tournament_pools WHERE id = NEW.pool_id;
    IF pl.stage_id <> NEW.stage_id THEN RAISE EXCEPTION 'Pool is not in this stage' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.pool_id IS NOT NULL THEN
    SELECT * INTO pl FROM tournament_pools WHERE id = NEW.pool_id;
    IF pl.stage_id <> NEW.stage_id THEN RAISE EXCEPTION 'Pool is not in this stage' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_structured_match_identity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_structured_match_identity
  BEFORE INSERT OR UPDATE OF division_id, stage_id, pool_id, round_id, champ_id ON public.club_champs_matches
  FOR EACH ROW EXECUTE FUNCTION public.guard_structured_match_identity();

-- The architecture discriminator is fixed once structure exists.
CREATE OR REPLACE FUNCTION public.guard_architecture_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.builder_architecture IS DISTINCT FROM OLD.builder_architecture
     AND EXISTS (SELECT 1 FROM club_champs_matches WHERE champ_id = NEW.id) THEN
    RAISE EXCEPTION 'Tournament architecture cannot change after games exist' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_architecture_change BEFORE UPDATE OF builder_architecture ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.guard_architecture_change();