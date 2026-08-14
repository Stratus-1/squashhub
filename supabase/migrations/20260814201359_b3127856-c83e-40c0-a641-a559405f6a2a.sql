ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'club_championship',
  ADD COLUMN IF NOT EXISTS max_entrants integer,
  ADD COLUMN IF NOT EXISTS max_per_league integer,
  ADD COLUMN IF NOT EXISTS seeding_source text NOT NULL DEFAULT 'ladder',
  ADD COLUMN IF NOT EXISTS participating_club_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tournaments.event_type IS 'club_championship | closed | open | invitational | ranking | league_finals';
COMMENT ON COLUMN public.tournaments.seeding_source IS 'ladder | ranking | manual';
COMMENT ON COLUMN public.tournaments.participating_club_ids IS 'Clubs (besides club_id) whose members and courts may be used — association/federation events.';