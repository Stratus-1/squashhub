import { BellsFormat } from "./bells";
import type { TournamentFormat } from "./types";

export * from "./types";
export { BellsFormat };

/**
 * Registry of pluggable tournament formats. Keyed by the value persisted
 * in `club_champs.scoring_mode`. `'standard'` is intentionally absent —
 * the existing Club Champs code paths are the implicit default until
 * Phase 2 extracts them into their own strategy.
 */
const REGISTRY: Record<string, TournamentFormat> = {
  [BellsFormat.key]: BellsFormat,
};

/** Look up a format strategy. Returns undefined for `'standard'` / unknown. */
export function getTournamentFormat(scoringMode: string | null | undefined): TournamentFormat | undefined {
  if (!scoringMode) return undefined;
  return REGISTRY[scoringMode];
}

/** All registered non-standard formats (for admin pickers). */
export function listTournamentFormats(): TournamentFormat[] {
  return Object.values(REGISTRY);
}
