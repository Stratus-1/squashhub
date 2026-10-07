/**
 * Pure helpers for writing league scorecard rows.
 *
 * Doubles positions keep the combined pair label in `*_player_name` (so every
 * existing screen keeps showing "Anna & Ben"), and additionally fill the
 * second-player and member-link columns so stats, bonus and serving rules know
 * exactly who played. Members are resolved from the pairs official on the
 * fixture date (plus reserves/bye players); a name that can't be resolved is
 * still stored as text, never guessed.
 */
export const normalizePlayerName = (name: string | null | undefined) =>
  (name || "").trim().replace(/\s+/g, " ").toUpperCase();

export function splitPair(label: string | null | undefined): [string, string] | null {
  const parts = String(label || "").split(/\s*(?:&|\/|\+)\s*/).map((s) => s.trim()).filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

export function doublesRubberColumns(
  homeName: string | null | undefined,
  awayName: string | null | undefined,
  idByName: Record<string, string>,
): Record<string, string | null> {
  const out: Record<string, string | null> = { rubber_type: "doubles" };
  const side = (prefix: "home" | "away", label: string | null | undefined) => {
    const pair = splitPair(label);
    if (!pair) return;
    out[`${prefix}_player2_name`] = pair[1];
    out[`${prefix}_player_member_id`] = idByName[normalizePlayerName(pair[0])] ?? null;
    out[`${prefix}_player2_member_id`] = idByName[normalizePlayerName(pair[1])] ?? null;
  };
  side("home", homeName);
  side("away", awayName);
  return out;
}

/** Drop games nobody has scored yet (0–0) so they are never saved as played. */
export function dropEmptyGames<T extends { home: number; away: number }>(scores: T[]): T[] {
  return (scores || []).filter((s) => (Number(s.home) || 0) > 0 || (Number(s.away) || 0) > 0);
}
