/**
 * Self-scheduled tournaments have no fixed fixture times: instead each round
 * carries a "must be played by" deadline. These helpers normalise the value
 * stored in `club_champs.round_play_by` (jsonb) and render it for invites and
 * fixtures.
 *
 * Accepted stored shapes (legacy tolerant):
 *  - "2026-09-15"                        → one deadline for every round
 *  - ["2026-09-15", "2026-09-30"]        → Round 1, Round 2
 *  - [{ label, date }, ...]              → canonical
 *  - { "1": "2026-09-15", ... }          → keyed by round number
 */
export type RoundDeadline = {
  label: string;
  date: string;
  /**
   * Optional per-round overrides used by self-scheduled knockouts:
   *  - `notes`: organiser instructions shown to players for this round.
   *  - `mode` : "club" flips this single round back to club-scheduled
   *             courts/times (typically the semi-final or final).
   * Both ride inside the existing `club_champs.round_play_by` jsonb.
   */
  notes?: string;
  mode?: "self" | "club";
};

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

export function defaultRoundLabel(index: number): string {
  return `Round ${index + 1}`;
}

export function parseRoundDeadlines(value: unknown): RoundDeadline[] {
  if (!value) return [];
  if (isDate(value)) return [{ label: "All rounds", date: (value as string).slice(0, 10) }];
  if (Array.isArray(value)) {
    return value
      .map((entry, i) => {
        if (isDate(entry)) return { label: defaultRoundLabel(i), date: entry.slice(0, 10) };
        if (entry && typeof entry === "object") {
          const date = (entry as any).date;
          if (!isDate(date)) return null;
          const label = String((entry as any).label || "").trim() || defaultRoundLabel(i);
          return { label, date: date.slice(0, 10) };
        }
        return null;
      })
      .filter(Boolean) as RoundDeadline[];
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, d]) => isDate(d))
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, d]) => ({
        label: /^\d+$/.test(k) ? `Round ${k}` : k,
        date: String(d).slice(0, 10),
      }));
  }
  return [];
}

/** What goes back into the database — `null` when nothing usable is set. */
export function serializeRoundDeadlines(list: RoundDeadline[]): RoundDeadline[] | null {
  const clean = list
    .filter((d) => isDate(d.date))
    .map((d, i) => ({ label: d.label.trim() || defaultRoundLabel(i), date: d.date.slice(0, 10) }));
  return clean.length ? clean : null;
}

/** Deadline that applies to a given round number (1-based); falls back to the last one. */
export function deadlineForRound(list: RoundDeadline[], roundNumber?: number | null): string | null {
  const clean = serializeRoundDeadlines(list) || [];
  if (clean.length === 0) return null;
  if (clean.length === 1) return clean[0].date;
  const idx = Math.max(1, Number(roundNumber) || 1) - 1;
  return (clean[idx] || clean[clean.length - 1]).date;
}

/** The very last date any game may be played on — useful as the tournament end. */
export function lastDeadline(list: RoundDeadline[]): string | null {
  const clean = serializeRoundDeadlines(list) || [];
  if (!clean.length) return null;
  return clean.map((d) => d.date).sort().slice(-1)[0];
}

function pretty(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Invite/email bullet lines, e.g. "Round 1 must be played by 15 Mar 2026". */
export function roundDeadlineLines(list: RoundDeadline[]): string[] {
  const clean = serializeRoundDeadlines(list) || [];
  return clean.map((d) => `${d.label} must be played by ${pretty(d.date)}`);
}

/** Short one-line summary for wizard section headers. */
export function roundDeadlineSummary(list: RoundDeadline[]): string {
  const clean = serializeRoundDeadlines(list) || [];
  if (!clean.length) return "No deadlines set";
  return clean.map((d) => `${d.label}: ${pretty(d.date)}`).join(" · ");
}
