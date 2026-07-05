ALTER TABLE public.club_champs DROP CONSTRAINT IF EXISTS club_champs_handicap_mode_check;
ALTER TABLE public.club_champs ADD CONSTRAINT club_champs_handicap_mode_check
  CHECK (handicap_mode = ANY (ARRAY['none'::text, 'league_rank'::text, 'group_order'::text, 'club_ladder'::text]));