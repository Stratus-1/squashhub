/**
 * Presentation-only helpers for the Stages & scheduling view (timeline, collapsed
 * summaries, court calendar). Pure: reads saved stage plans, never writes or books.
 */
export type ViewDay = { date: string; from: string; to: string; courtIds: string[] };
export type ViewStage = {
  id: string; name: string; unit: string; mode: "play_by" | "scheduled" | "later";
  deadline: string; date: string; from: string; to: string; courtIds: string[];
  extraDays?: ViewDay[]; phase?: "main" | "playoff";
};
export type StageStatus = "conflict" | "short" | "incomplete" | "fits" | "reserved" | "play_by" | "later";
export type Capacity = { matches: number; slots: number; fits: boolean } | null;

export const STATUS_LABEL: Record<StageStatus, string> = {
  conflict: "Court clash", short: "Too few slots", incomplete: "Needs details",
  fits: "Fits", reserved: "Courts planned", play_by: "Play-by deadline", later: "Decide later",
};

export function stageDays(s: ViewStage): ViewDay[] {
  if (s.mode !== "scheduled") return [];
  return [{ date: s.date, from: s.from, to: s.to, courtIds: s.courtIds }, ...(s.extraDays ?? [])].filter((d) => d.date);
}

/** Has the organiser filled in every field this scheduling method needs? */
export function stageConfigured(s: ViewStage): boolean {
  if (s.mode === "later") return true;
  if (s.mode === "play_by") return !!s.deadline;
  const days = [{ date: s.date, from: s.from, to: s.to, courtIds: s.courtIds }, ...(s.extraDays ?? [])];
  return days.every((d) => d.date && d.from && d.to && d.from < d.to && d.courtIds.length > 0);
}

const overlap = (a: ViewDay, b: ViewDay) => a.date === b.date && a.from < b.to && b.from < a.to && a.courtIds.some((c) => b.courtIds.includes(c));

/**
 * Stages that reserve the same court at overlapping times. Two playoff stages may
 * deliberately share one evening (e.g. per-category semifinals), so playoff↔playoff
 * overlaps are reported as `shared`, not a clash.
 */
export function courtOverlaps(stages: ViewStage[]): { clash: Map<string, string[]>; shared: Map<string, string[]> } {
  const clash = new Map<string, string[]>(); const shared = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, id: string, name: string) => { const l = m.get(id) ?? []; if (!l.includes(name)) l.push(name); m.set(id, l); };
  for (let i = 0; i < stages.length; i++) for (let j = i + 1; j < stages.length; j++) {
    const a = stages[i], b = stages[j];
    if (!stageDays(a).some((d) => stageDays(b).some((e) => overlap(d, e)))) continue;
    const m = a.phase === "playoff" && b.phase === "playoff" ? shared : clash;
    add(m, a.id, b.name); add(m, b.id, a.name);
  }
  return { clash, shared };
}

export function stageStatus(s: ViewStage, cap: Capacity, clash: boolean): StageStatus {
  if (clash) return "conflict";
  if (!stageConfigured(s)) return "incomplete";
  if (s.mode === "later") return "later";
  if (s.mode === "play_by") return "play_by";
  if (cap) return cap.fits ? "fits" : "short";
  return "reserved";
}

/** Card number: "01", "02"… for main rounds; QF / SF / F for standard playoff stages. */
export function stageBadge(s: ViewStage, index: number): string {
  if (s.phase === "playoff") {
    const n = s.name.toLowerCase();
    if (n.startsWith("quarter")) return "QF";
    if (n.startsWith("semi")) return "SF";
    if (n.startsWith("final")) return "F";
    return "PO";
  }
  return String(index + 1).padStart(2, "0");
}

export type CalendarEntry = { stageId: string; name: string; unit: string; from: string; to: string; courtIds: string[]; status: StageStatus };
export type CalendarRow = { date: string; entries: CalendarEntry[] };

/** One row per planned date; each entry is a planned court reservation (never a booking). */
export function calendarRows(stages: ViewStage[], statusOf: (id: string) => StageStatus): CalendarRow[] {
  const by = new Map<string, CalendarEntry[]>();
  for (const s of stages) for (const d of stageDays(s)) {
    const l = by.get(d.date) ?? [];
    l.push({ stageId: s.id, name: s.name, unit: s.unit, from: d.from, to: d.to, courtIds: d.courtIds, status: statusOf(s.id) });
    by.set(d.date, l);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, entries]) => ({ date, entries: entries.sort((x, y) => (x.from || "").localeCompare(y.from || "")) }));
}

export type MatrixCell = { from: string; to: string; clash: string[]; shared: string[] } | null;
export type RoundMatrix = { stageId: string; days: string[]; courts: string[]; cells: Record<string, Record<string, MatrixCell>>; first: string; last: string };

/**
 * One stage's planned reservations as a court × day grid (rows = courts, columns = dates).
 * A cell lists the other stages reserving that court at an overlapping time on that date
 * (clash = involves a main round, shared = playoff↔playoff). Planning only, never bookings.
 */
export function roundMatrix(s: ViewStage, all: ViewStage[]): RoundMatrix {
  const days = stageDays(s).slice().sort((a, b) => a.date.localeCompare(b.date));
  const dates = [...new Set(days.map((d) => d.date))];
  const courts = [...new Set(days.flatMap((d) => d.courtIds.map(String)))].sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));
  const cells: RoundMatrix["cells"] = {};
  for (const c of courts) {
    cells[c] = {};
    for (const date of dates) {
      const d = days.find((x) => x.date === date && x.courtIds.map(String).includes(c));
      if (!d) { cells[c][date] = null; continue; }
      const clash: string[] = []; const shared: string[] = [];
      for (const o of all) {
        if (o.id === s.id) continue;
        if (!stageDays(o).some((e) => e.date === date && e.courtIds.map(String).includes(c) && d.from < e.to && e.from < d.to)) continue;
        (s.phase === "playoff" && o.phase === "playoff" ? shared : clash).push(o.name);
      }
      cells[c][date] = { from: d.from, to: d.to, clash, shared };
    }
  }
  return { stageId: s.id, days: dates, courts, cells, first: dates[0] ?? "", last: dates[dates.length - 1] ?? "" };
}
