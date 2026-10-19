type GridBooking = { court_id: number; start_time: string; end_time: string };

function minutes(time: string): number {
  const [hours, mins] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + mins;
}

// Presentation only: a continuation must never hide another game's entry.
export function bookingsForGridRow<T extends GridBooking>(
  bookings: readonly T[], courtId: number, time: string, slotMinutes: number,
): T[] {
  const rowStart = minutes(time);
  return bookings.filter((booking) => booking.court_id === courtId
    && minutes(booking.start_time) < rowStart + slotMinutes
    && minutes(booking.end_time) > rowStart)
    .sort((a, b) => minutes(a.start_time) - minutes(b.start_time));
}

export type GridSpan = { court_id: number; start_time: string; end_time: string };

/** Saved tournament configuration wins over historical booking lengths. */
export function championshipGridMinutes(bookings: readonly (GridSpan & { champ_slot_minutes?: number })[]): number {
  const counts = new Map<number, number>();
  for (const booking of bookings) {
    const configured = Number(booking.champ_slot_minutes);
    const duration = configured >= 15 ? configured : minutes(booking.end_time) - minutes(booking.start_time);
    if (duration >= 15) counts.set(duration, (counts.get(duration) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

function hhmm(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Presentation only. Inside a court's championship evening (merged spans) the
 * rows follow the tournament's own match length; everywhere else the club's
 * normal slots stay. Returns the union of row times and each court's slot
 * length per row (missing = that court has no slot starting on this row).
 */
export function champsGridLayout(
  normalTimes: readonly string[], normalMinutes: number,
  spans: readonly GridSpan[], champMinutes: number, mergeGapMinutes = 60,
): { rows: string[]; cell: (courtId: number, time: string) => number | null } {
  const byCourt = new Map<number, { s: number; e: number }[]>();
  if (champMinutes >= 15) {
    for (const sp of spans) {
      const s = minutes(sp.start_time), e = minutes(sp.end_time);
      if (!(e > s)) continue;
      const list = byCourt.get(sp.court_id) ?? [];
      list.push({ s, e });
      byCourt.set(sp.court_id, list);
    }
  }
  const champCells = new Map<number, Map<string, number>>();
  const merged = new Map<number, { s: number; e: number }[]>();
  for (const [court, list] of byCourt) {
    list.sort((a, b) => a.s - b.s);
    const m: { s: number; e: number }[] = [];
    for (const sp of list) {
      const last = m[m.length - 1];
      if (last && sp.s <= last.e + mergeGapMinutes) last.e = Math.max(last.e, sp.e); else m.push({ ...sp });
    }
    merged.set(court, m);
    const cells = new Map<string, number>();
    for (const sp of m) for (let t = sp.s; t + champMinutes <= sp.e; t += champMinutes) cells.set(hhmm(t), champMinutes);
    champCells.set(court, cells);
  }
  const rowSet = new Set(normalTimes.map((t) => t.slice(0, 5)));
  for (const cells of champCells.values()) for (const t of cells.keys()) rowSet.add(t);
  const rows = [...rowSet].sort((a, b) => minutes(a) - minutes(b));
  const normal = new Set(normalTimes.map((t) => t.slice(0, 5)));
  return {
    rows,
    cell: (courtId, time) => {
      const t = time.slice(0, 5);
      const champ = champCells.get(courtId)?.get(t);
      if (champ) return champ;
      if (!normal.has(t)) return null;
      const tm = minutes(t);
      if ((merged.get(courtId) ?? []).some((sp) => tm >= sp.s && tm < sp.e)) return null;
      return normalMinutes;
    },
  };
}
