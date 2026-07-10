import { StandardFormat } from "./standard";
import type { TournamentFormat } from "./types";

/**
 * Swiss — Swiss-pairing tournament. Admin pairs each round manually
 * (Phase 1: option + manual pairing). Standings mirror Standard for now
 * (win/loss with tournament points and game diff as tiebreaker); a
 * Buchholz tiebreaker can layer on later.
 *
 * Persisted as `club_champs.scoring_mode = 'swiss'`. Configuration for
 * pools-per-league and rounds-per-league lives in the jsonb columns
 * `club_champs.swiss_pools` and `club_champs.swiss_rounds` (keyed by
 * group_number as string, integer value).
 */
export const SwissFormat: TournamentFormat = {
  ...StandardFormat,
  key: "swiss",
  label: "Swiss pairing — fixed rounds, paired by score each round",
  description:
    "Players are re-paired every round against opponents on similar scores. Admin sets pools per league and rounds; pairings are done manually round-by-round.",
  markerLabel: "Mark",
  badge: { label: "Swiss", variant: "secondary" },
};
