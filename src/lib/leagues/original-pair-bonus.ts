/**
 * Doubles original-pair bonus.
 *
 * A pair earns the bonus only when BOTH players of one of the team's original
 * pairs (as officially saved by an admin, effective on the fixture date) play
 * together in a rubber. If either player is a sub, that rubber earns nothing.
 * Each original pair can earn the bonus at most once per fixture.
 */

export interface DatedPair {
  one: string;
  two: string;
  effective_from?: string | null; // yyyy-mm-dd
  effective_to?: string | null; // exclusive, yyyy-mm-dd
  is_active?: boolean | null;
}

const norm = (s: string | null | undefined) =>
  (s || "").toLowerCase().replace(/\s+/g, " ").trim();

/** Splits a doubles row label ("A & B", "A / B", "A and B") into two names. */
export function splitPairLabel(label: string | null | undefined): [string, string] | null {
  const parts = String(label || "")
    .split(/\s*(?:&|\/|\+|\band\b)\s*/i)
    .map(norm)
    .filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

/** Same split as splitPairLabel but keeps the original capitalisation (for display/saving). */
export function splitPairLabelDisplay(label: string | null | undefined): [string, string] | null {
  const parts = String(label || "")
    .split(/\s*(?:&|\/|\+|\band\b)\s*/i)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

export const pairKey = (a: string, b: string) => [norm(a), norm(b)].sort().join("|");

/**
 * Pairs that were official on `date`. A pair edited mid-season is replaced
 * from its edit date onwards; fixtures before the edit keep the old pair.
 */
export function pairsEffectiveOn<T extends DatedPair>(pairs: T[], date: string | null | undefined): T[] {
  if (!date) return pairs.filter((p) => p.is_active !== false);
  return pairs.filter((p) => {
    const from = p.effective_from || "0000-01-01";
    if (from > date) return false;
    if (p.effective_to && p.effective_to <= date) return false;
    // Rows with no end date but inactive were deleted outright — ignore.
    if (!p.effective_to && p.is_active === false) return false;
    return true;
  });
}

/** Counts rubbers played by a complete original pair (each pair counted once). */
export function countOriginalPairs(playedLabels: Array<string | null | undefined>, originalPairKeys: string[]): number {
  const originals = new Set(originalPairKeys);
  const used = new Set<string>();
  for (const label of playedLabels) {
    const split = splitPairLabel(label);
    if (!split) continue;
    const key = pairKey(split[0], split[1]);
    if (originals.has(key) && !used.has(key)) used.add(key);
  }
  return used.size;
}
