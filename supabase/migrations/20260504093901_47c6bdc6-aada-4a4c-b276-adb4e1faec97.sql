-- Tournament play-format options
-- round_format: 'single_round_robin' (default, current behaviour) or 'double_round_robin' (NAC-style home & away)
-- bye_handling: 'no_match' (default), 'walkover_win' (auto full points), or 'neutral' (excluded from averages)

ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS round_format text NOT NULL DEFAULT 'single_round_robin',
  ADD COLUMN IF NOT EXISTS bye_handling text NOT NULL DEFAULT 'no_match';

ALTER TABLE public.club_champs
  DROP CONSTRAINT IF EXISTS club_champs_round_format_check,
  DROP CONSTRAINT IF EXISTS club_champs_bye_handling_check;

ALTER TABLE public.club_champs
  ADD CONSTRAINT club_champs_round_format_check
    CHECK (round_format IN ('single_round_robin','double_round_robin')),
  ADD CONSTRAINT club_champs_bye_handling_check
    CHECK (bye_handling IN ('no_match','walkover_win','neutral'));

-- Per-match home/away marker. NULL = neutral (current behaviour, no leg).
-- 'home' means player_a is at home; 'away' means player_a is the away team.
ALTER TABLE public.club_champs_matches
  ADD COLUMN IF NOT EXISTS leg text,
  ADD COLUMN IF NOT EXISTS is_bye boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bye_member_id uuid;

ALTER TABLE public.club_champs_matches
  DROP CONSTRAINT IF EXISTS club_champs_matches_leg_check;

ALTER TABLE public.club_champs_matches
  ADD CONSTRAINT club_champs_matches_leg_check
    CHECK (leg IS NULL OR leg IN ('home','away'));