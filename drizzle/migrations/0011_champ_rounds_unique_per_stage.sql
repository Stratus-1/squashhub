ALTER TABLE public.club_champs_rounds DROP CONSTRAINT IF EXISTS club_champs_rounds_unique;
CREATE UNIQUE INDEX IF NOT EXISTS club_champs_rounds_unique_per_stage
  ON public.club_champs_rounds (champ_id, group_number, section_number, COALESCE(stage_id, '00000000-0000-0000-0000-000000000000'::uuid), round_number);
COMMENT ON INDEX public.club_champs_rounds_unique_per_stage IS 'Round numbers restart per structured stage (e.g. Semifinal Round 1 alongside round-robin Round 1); legacy rounds without a stage keep the old uniqueness.';