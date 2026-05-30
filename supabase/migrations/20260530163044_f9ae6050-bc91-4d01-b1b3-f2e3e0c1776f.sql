-- Bells doubles tournament format: additive columns only.

ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS scoring_mode text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS group_durations jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.club_champs
  DROP CONSTRAINT IF EXISTS club_champs_scoring_mode_check;
ALTER TABLE public.club_champs
  ADD CONSTRAINT club_champs_scoring_mode_check
  CHECK (scoring_mode IN ('standard', 'time_capped_points'));

ALTER TABLE public.club_champs_matches
  ADD COLUMN IF NOT EXISTS side_a_points integer,
  ADD COLUMN IF NOT EXISTS side_b_points integer;

COMMENT ON COLUMN public.club_champs.scoring_mode IS
  'standard = win/loss + game points; time_capped_points = bells doubles (cumulative points-for).';
COMMENT ON COLUMN public.club_champs.group_durations IS
  'Per-group time cap in minutes for bells tournaments, e.g. {"1":30,"2":25,"3":20}. Falls back to match_duration_minutes.';
COMMENT ON COLUMN public.club_champs_matches.side_a_points IS
  'Points scored by Player A + Partner A pair when the bell rang (bells format only).';
COMMENT ON COLUMN public.club_champs_matches.side_b_points IS
  'Points scored by Player B + Partner B pair when the bell rang (bells format only).';