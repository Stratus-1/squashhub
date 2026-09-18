ALTER TABLE public.league_rules
  ADD COLUMN IF NOT EXISTS cross_gender_league_play_allowed boolean NOT NULL DEFAULT false;

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS cross_gender_league_play_allowed boolean;

ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS cross_gender_ladder_position integer;

COMMENT ON COLUMN public.league_rules.cross_gender_league_play_allowed IS
  'Association default: ladies with recent men''s-league history may be filled into men''s teams and ranked in the men''s ladder.';
COMMENT ON COLUMN public.clubs.cross_gender_league_play_allowed IS
  'Club override of the association cross-gender league play setting. NULL = inherit.';
COMMENT ON COLUMN public.club_members.cross_gender_ladder_position IS
  'Position in the OTHER gender ladder for cross-listed players. ladder_position stays authoritative for their own ladder.';