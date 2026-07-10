import { BellsFormat } from "./bells";
import { StandardFormat } from "./standard";
import { SwissFormat } from "./swiss";
import type { TournamentFormat } from "./types";

export * from "./types";
export { BellsFormat, StandardFormat, SwissFormat };

/**
 * Registry of pluggable tournament formats. Keyed by the value persisted
 * in `club_champs.scoring_mode`. Standard is the fallback for legacy
 * rows where `scoring_mode` is null/empty/unknown.
 */
const REGISTRY: Record<string, TournamentFormat> = {
  [StandardFormat.key]: StandardFormat,
  [BellsFormat.key]: BellsFormat,
};

/**
 * Look up a format strategy. Always returns a strategy — falls back to
 * `StandardFormat` for null/unknown values so call sites never need to
 * branch on "did I get one?".
 */
export function getTournamentFormat(scoringMode: string | null | undefined): TournamentFormat {
  if (scoringMode && REGISTRY[scoringMode]) return REGISTRY[scoringMode];
  return StandardFormat;
}

/** All registered formats (for admin pickers). */
export function listTournamentFormats(): TournamentFormat[] {
  return Object.values(REGISTRY);
}
