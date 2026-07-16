
ALTER TABLE public.club_champs_matches
  ALTER COLUMN player_a_member_id DROP NOT NULL,
  ALTER COLUMN player_b_member_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'group',
  ADD COLUMN IF NOT EXISTS stage_label text,
  ADD COLUMN IF NOT EXISTS bracket_position integer;

CREATE INDEX IF NOT EXISTS club_champs_matches_stage_idx
  ON public.club_champs_matches (champ_id, stage);
