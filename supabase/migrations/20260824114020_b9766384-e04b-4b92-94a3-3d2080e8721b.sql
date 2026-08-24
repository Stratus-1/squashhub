ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS champion_scope text NOT NULL DEFAULT 'division';

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_champion_scope_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_champion_scope_check
  CHECK (champion_scope IN ('division', 'pool'));

COMMENT ON COLUMN public.tournaments.champion_scope IS
  'Where the ultimate winner is decided: division = pool winners meet in a league final (one champion per league); pool = each pool keeps its own winner.';