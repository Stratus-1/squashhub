-- Central round definitions and championship milestone deadlines for tournaments.
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS round_definitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS milestone_play_by jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tournaments.round_definitions IS
  'Single source of truth for early knockout/round-robin rounds: [{round, label, play_by, notes}]. Shared by every league; leagues progress through them independently.';
COMMENT ON COLUMN public.tournaments.milestone_play_by IS
  'Centrally defined championship deadlines: {quarter_final, semi_final, final, third_place}. The system decides when each league reaches each stage.';

-- Per-league round rows become references to the central definitions.
ALTER TABLE public.club_champs_rounds
  ADD COLUMN IF NOT EXISTS stage_key text,
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS field_size integer;

COMMENT ON COLUMN public.club_champs_rounds.stage_key IS
  'early | quarter_final | semi_final | final | third_place — machine truth for the stage; label stays free text.';
COMMENT ON COLUMN public.club_champs_rounds.scope IS
  'section = a pool round, league = a cross-pool round (section 0).';
COMMENT ON COLUMN public.club_champs_rounds.field_size IS
  'How many players were still alive in the whole league when this round was created. Written once, for audit.';
COMMENT ON COLUMN public.club_champs_rounds.play_by IS
  'Per-league OVERRIDE only. Normally null: the effective date resolves from tournaments.round_definitions / milestone_play_by.';

ALTER TABLE public.club_champs_matches
  ADD COLUMN IF NOT EXISTS stage_key text;

COMMENT ON COLUMN public.club_champs_matches.stage_key IS
  'Stage of this fixture at the LEAGUE level (early | quarter_final | semi_final | final | third_place).';

-- Audit trail for edits to a central round date.
CREATE TABLE IF NOT EXISTS public.champ_round_date_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  champ_id uuid NOT NULL,
  club_id uuid NOT NULL,
  changed_by uuid,
  scope text NOT NULL,
  round_number integer,
  stage_key text,
  old_play_by date,
  new_play_by date,
  fixtures_affected integer NOT NULL DEFAULT 0,
  fixtures_protected integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.champ_round_date_audit TO authenticated;
GRANT ALL ON public.champ_round_date_audit TO service_role;

ALTER TABLE public.champ_round_date_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can view round date audit"
  ON public.champ_round_date_audit FOR SELECT TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Club admins can record round date audit"
  ON public.champ_round_date_audit FOR INSERT TO authenticated
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE INDEX IF NOT EXISTS champ_round_date_audit_champ_idx
  ON public.champ_round_date_audit (champ_id, created_at DESC);