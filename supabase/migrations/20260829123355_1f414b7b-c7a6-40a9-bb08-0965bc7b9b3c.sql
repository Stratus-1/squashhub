ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS league_draw_styles jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.tournaments.league_draw_styles IS
  'Per-division knockout draw style: {"1":"straight"|"graduated"}. Graduated staggers entry — only the weakest slice plays each early round.';