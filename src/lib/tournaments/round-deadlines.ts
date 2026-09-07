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
          const notes = String((entry as any).notes || "").trim();
          const mode = (entry as any).mode === "club" ? "club" : undefined;
          return { label, date: date.slice(0, 10), ...(notes ? { notes } : {}), ...(mode ? { mode } : {}) };
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
    .map((d, i) => ({
      label: d.label.trim() || defaultRoundLabel(i),
      date: d.date.slice(0, 10),
      ...(d.notes && d.notes.trim() ? { notes: d.notes.trim() } : {}),
      ...(d.mode === "club" ? { mode: "club" as const } : {}),
    }));
  return clean.length ? clean : null;
}

/**
 * Rounds created later from the draw (`club_champs_rounds`) are the live truth
 * for a round's name and play-by date. The tournament's own `round_play_by`
 * list is only what was planned up front, so it goes stale as soon as an
 * organiser sets up round 4 from the knockout screen. Merging the two keeps the
 * setup screen and the "book your court by …" nudges on the real date.
 */
export function mergeRoundDeadlines(
  planned: RoundDeadline[],
  rounds: Array<{ round_number?: number | null; label?: string | null; play_by?: string | null }> = [],
): RoundDeadline[] {
  const out = [...planned];
  const latest = new Map<number, { label?: string | null; date: string }>();
  for (const r of rounds || []) {
    const n = Number(r?.round_number);
    const date = typeof r?.play_by === "string" ? r.play_by.slice(0, 10) : "";
    if (!Number.isFinite(n) || n < 1 || !isDate(date)) continue;
    const prev = latest.get(n);
    // Several sections share a round number — keep the latest deadline.
    if (!prev || date > prev.date) latest.set(n, { label: r.label, date });
  }
  for (const [n, v] of latest) {
    const i = n - 1;
    while (out.length < i) out.push({ label: defaultRoundLabel(out.length), date: "" });
    const existing = out[i];
    out[i] = {
      ...(existing || {}),
      label: (existing?.label || "").trim() || String(v.label || "").trim() || defaultRoundLabel(i),
      date: v.date,
    };
  }
  return out;
}


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

/**
 * Nudge shown on an unscheduled fixture: "Book your court by 15 Sep".
 * Tone escalates as the deadline approaches so players see the urgency.
 */
export function playByNudge(
  deadline: string | null | undefined,
  today: string,
): { label: string; short: string; tone: "ok" | "soon" | "late"; daysLeft: number } | null {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}/.test(deadline)) return null;
  const date = deadline.slice(0, 10);
  const ms = new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime();
  const daysLeft = Math.round(ms / 86_400_000);
  const nice = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const tone = daysLeft < 0 ? "late" : daysLeft <= 3 ? "soon" : "ok";
  const label =
    tone === "late"
      ? `Overdue — should have been played by ${nice}`
      : daysLeft === 0
        ? "Play by today"
        : `Book your court by ${nice}`;
  const short = tone === "late" ? `Overdue ${nice}` : daysLeft === 0 ? "Today" : `By ${nice}`;
  return { label, short, tone, daysLeft };
}
