import type { BookableStage } from "./stage-bookings";

type CourtDay = {
  date: string;
  courtIds?: string[];
  windows: Array<{ from: string; to: string }>;
};

/** Availability envelopes only: no fixtures, pairings or timetable generation. */
export function dayCourtStages(days: CourtDay[]): BookableStage[] {
  const windows = new Map<string, Array<{ from: string; to: string }>>();
  for (const day of days) {
    if (!day.date) continue;
    for (const court of new Set(day.courtIds ?? [])) {
      const key = `${day.date}|${court}`;
      const valid = day.windows.filter((w) => w.from && w.to && w.from < w.to);
      windows.set(key, [...(windows.get(key) ?? []), ...valid]);
    }
  }
  return [...windows.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, values]) => {
    const [date, court] = key.split("|");
    const merged: Array<{ from: string; to: string }> = [];
    for (const window of [...values].sort((a, b) => a.from.localeCompare(b.from))) {
      const previous = merged[merged.length - 1];
      if (previous && window.from <= previous.to) previous.to = previous.to > window.to ? previous.to : window.to;
      else merged.push({ ...window });
    }
    return merged.map((w) => ({
      id: `${date}:${w.from.replace(":", "")}-${w.to.replace(":", "")}`,
      name: "Tournament court time", mode: "scheduled", date,
      from: w.from, to: w.to, courtIds: [court],
    }));
  });
}