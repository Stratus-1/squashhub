ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS league_forfeit_rules jsonb,
  ADD COLUMN IF NOT EXISTS league_forfeit_points jsonb;

COMMENT ON COLUMN public.tournaments.league_forfeit_rules IS
  'Per-league forfeit / no-show rule keyed by league number: walkover_win | award_points | neutral. Authoritative over the legacy tournament_rules.no_show_* fields.';
COMMENT ON COLUMN public.tournaments.league_forfeit_points IS
  'Per-league points for the award_points rule: {"1":{"opponent":10,"player":0}}. Only used by points-based formats (Bells).';