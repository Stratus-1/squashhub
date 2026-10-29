import { unitCapacity } from "./structure-capacity";
import { resolveStagePlan, type PlanAnswers } from "./stage-plan";
import { rrSizes } from "./rr-topology";

export interface CourtsCapacityUnit {
  key: string;
  label: string;
  entrants: number;
  doubles: boolean;
  estimated: boolean;
  slotMinutes: number;
  poolSlots?: number[];
  playoffGames: number;
  playoffRounds?: number;
  playoffUnresolved: boolean;
}
export interface CourtsCapacityDay {
  date: string;
  courts: string;
  courtIds?: string[];
  windows: { from: string; to: string }[];
}

const minute = (value: string) => /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;

/** Read-only aggregate court-time check, not a timetable or permission to generate games. */
export function courtsCapacity(answers: PlanAnswers, days: CourtsCapacityDay[], units: CourtsCapacityUnit[]) {
  // Union windows per date/court so overlapping lines cannot inflate capacity.
  const windows = new Map<string, [number, number][]>();
  for (const day of days) {
    const courts = day.courtIds !== undefined ? [...new Set(day.courtIds)] : Array.from({ length: Math.max(0, Number(day.courts) || 0) }, (_, i) => `legacy-${i}`);
    for (const court of courts) for (const w of day.windows) {
      const from = minute(w.from), to = minute(w.to);
      if (!day.date || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
      const key = `${day.date}:${court}`;
      windows.set(key, [...(windows.get(key) ?? []), [from, to]]);
    }
  }
  const intervals: [number, number][] = [];
  for (const ranges of windows.values()) {
    const merged: [number, number][] = [];
    for (const range of ranges.sort((a, b) => a[0] - b[0])) {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
    }
    intervals.push(...merged);
  }
  const availableMinutes = intervals.reduce((sum, [from, to]) => sum + to - from, 0);
  const rows = units.map((u) => {
    const stages = resolveStagePlan(answers, u.key).stages;
    const unsupported = stages.some((s) => s.kind === "cross_league" || s.kind === "placement" || !!s.sharedWith);
    const cap = unitCapacity(answers, u.key, u.entrants);
    // A knockout already in the stage chain must not be charged again as legacy playoffs.
    const playoffs = stages.some((s) => s.kind === "knockout") ? 0 : u.playoffGames;
    const games = cap.matches + playoffs;
    const first = stages[0];
    const initialMatches = cap.stages[0]?.matches ?? 0;
    const sizedPools = first && (first.kind === "round_robin" || first.kind === "pools") && !first.rrTopology && u.poolSlots?.length === (first.pools ?? 1)
      ? rrSizes(u.entrants, first.pools ?? 1) : null;
    const initialMinutes = sizedPools && u.poolSlots ? sizedPools.reduce((sum, n, i) => sum + n * (n - 1) / 2 * u.poolSlots[i], 0) : initialMatches * u.slotMinutes;
    const requiredMinutes = initialMinutes + (games - initialMatches) * u.slotMinutes;
    const incomplete = unsupported || cap.undecided > 0 || u.entrants < 2 || u.slotMinutes <= 0 || u.playoffUnresolved;
    const playoffSlots = playoffs > 0 && u.playoffRounds ? Array.from({ length: u.playoffRounds }, (_, i) => {
      const matches = 2 ** (u.playoffRounds - i - 1);
      const label = matches === 4 ? "Quarterfinals" : matches === 2 ? "Semifinals" : "Final";
      return { label, matches, minutes: matches * u.slotMinutes };
    }) : [];
    return { ...u, stages: cap.stages, poolGames: cap.matches, playoffs, playoffSlots, playoffMinutes: playoffs * u.slotMinutes, games, requiredMinutes, incomplete };
  });
  const requiredMinutes = rows.reduce((sum, r) => sum + r.requiredMinutes, 0);
  const games = rows.reduce((sum, r) => sum + r.games, 0);
  const incomplete = !rows.length || !availableMinutes || rows.some((r) => r.incomplete);
  const slotLengths = [...new Set(rows.flatMap((r) => r.poolSlots ?? [r.slotMinutes]))];
  const slotMinutes = slotLengths.length === 1 && slotLengths[0] > 0 ? slotLengths[0] : null;
  const availableSlots = slotMinutes == null ? null : intervals.reduce((sum, [from, to]) => sum + Math.floor((to - from) / slotMinutes), 0);
  const fits = incomplete ? null : requiredMinutes <= availableMinutes && (availableSlots == null || games <= availableSlots);
  return { rows, availableMinutes, requiredMinutes, games, slotMinutes, availableSlots, incomplete, fits };
}