// Round-robin pairing + slot allocator for league rounds
import { addMinutes, format, parse } from "date-fns";

export type Pairing = { home: string; away: string };

/**
 * Single round-robin: every team plays each other once.
 * Uses the circle method. Returns rounds of pairings (BYE pairings excluded).
 */
export function roundRobin(teams: string[]): Pairing[][] {
  const ts = [...teams];
  if (ts.length < 2) return [];
  if (ts.length % 2 === 1) ts.push("__BYE__");
  const n = ts.length;
  const rounds: Pairing[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ts[i];
      const b = ts[n - 1 - i];
      if (a !== "__BYE__" && b !== "__BYE__") {
        round.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
      }
    }
    rounds.push(round);
    // rotate (keep ts[0] fixed)
    ts.splice(1, 0, ts.pop()!);
  }
  return rounds;
}

/**
 * Flatten pairings into all-vs-all (single round) for a single round of play.
 */
export function allPairsOnce(teams: string[]): Pairing[] {
  const out: Pairing[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      out.push({ home: teams[i], away: teams[j] });
    }
  }
  return out;
}

export type SlotAssignment = {
  home: string;
  away: string;
  courtId: number;
  startTime: string; // HH:mm
  date: string;      // yyyy-MM-dd
};

export type RoundRobinAllocation = {
  slots: SlotAssignment[];
  byes: { team: string; date: string }[];
  error?: string;
};

function normalizeTime(time: string): string {
  return String(time || "").slice(0, 5);
}

function buildSlotTimes(startTime: string, endTime: string, slotMinutes: number): string[] {
  const start = parse(normalizeTime(startTime), "HH:mm", new Date());
  const end = parse(normalizeTime(endTime), "HH:mm", new Date());
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || slotMinutes <= 0) return [];
  const slotTimes: string[] = [];
  let cur = start;
  while (cur < end) {
    slotTimes.push(format(cur, "HH:mm"));
    cur = addMinutes(cur, slotMinutes);
  }
  return slotTimes;
}

function eachDate(startDate: string, endDate: string, allowedDows?: number[]): string[] {
  const out: string[] = [];
  const s = parse(startDate, "yyyy-MM-dd", new Date());
  const e = parse(endDate || startDate, "yyyy-MM-dd", new Date());
  const filter = allowedDows && allowedDows.length > 0 ? new Set(allowedDows) : null;
  let cur = s;
  while (cur <= e) {
    if (!filter || filter.has(cur.getDay())) {
      out.push(format(cur, "yyyy-MM-dd"));
    }
    cur = addMinutes(cur, 24 * 60);
  }
  return out;
}

/**
 * Allocate pairings across (dates × time slots × courts), avoiding back-to-back
 * conflicts for any single team where possible. Spreads matches over the full
 * date window of the round.
 */
export function allocateSlots(
  pairings: Pairing[],
  courtIds: number[],
  startTime: string,
  endTime: string,
  slotMinutes: number,
  startDate?: string,
  endDate?: string,
  playDows?: number[],
): SlotAssignment[] {
  if (!courtIds.length || !pairings.length) return [];
  const slotTimes = buildSlotTimes(startTime, endTime, slotMinutes);
  if (!slotTimes.length) return [];

  const dates = startDate
    ? eachDate(startDate, endDate || startDate, playDows)
    : [format(new Date(), "yyyy-MM-dd")];
  if (!dates.length) return [];

  // Build full slot grid (date × time)
  const grid: { date: string; time: string }[] = [];
  for (const d of dates) for (const t of slotTimes) grid.push({ date: d, time: t });

  const remaining = [...pairings];
  const out: SlotAssignment[] = [];
  const lastSlotByTeam = new Map<string, number>();

  for (let s = 0; s < grid.length && remaining.length; s++) {
    const usedTeams = new Set<string>();
    for (const courtId of courtIds) {
      if (!remaining.length) break;
      let pickIdx = remaining.findIndex(
        (p) =>
          !usedTeams.has(p.home) &&
          !usedTeams.has(p.away) &&
          (lastSlotByTeam.get(p.home) ?? -2) !== s - 1 &&
          (lastSlotByTeam.get(p.away) ?? -2) !== s - 1,
      );
      if (pickIdx === -1) {
        pickIdx = remaining.findIndex(
          (p) => !usedTeams.has(p.home) && !usedTeams.has(p.away),
        );
      }
      if (pickIdx === -1) break;
      const [pair] = remaining.splice(pickIdx, 1);
      out.push({ ...pair, courtId, startTime: grid[s].time, date: grid[s].date });
      usedTeams.add(pair.home);
      usedTeams.add(pair.away);
      lastSlotByTeam.set(pair.home, s);
      lastSlotByTeam.set(pair.away, s);
    }
  }
  // overflow → last slot
  const lastCell = grid[grid.length - 1];
  for (const p of remaining) {
    out.push({ ...p, courtId: courtIds[0], startTime: lastCell.time, date: lastCell.date });
  }
  return out;
}

/**
 * Allocate a true round-robin as one matchday per pairing round.
 * This keeps excluded teams out of the plan, avoids accidental BYEs for even
 * team counts, and prevents spillover from making one date carry extra games.
 */
export function allocateRoundRobinByDate(
  teams: string[],
  courtIds: number[],
  startTime: string,
  endTime: string,
  slotMinutes: number,
  startDate?: string,
  endDate?: string,
  playDows?: number[],
): RoundRobinAllocation {
  const cleanTeams = [...new Set(teams.filter(Boolean))];
  if (cleanTeams.length < 2) return { slots: [], byes: [], error: "Select at least 2 teams to distribute." };
  if (!courtIds.length) return { slots: [], byes: [], error: "No courts assigned to this round." };
  const dates = startDate ? eachDate(startDate, endDate || startDate, playDows) : [format(new Date(), "yyyy-MM-dd")];
  const slotTimes = buildSlotTimes(startTime, endTime, slotMinutes);
  if (!dates.length || !slotTimes.length) return { slots: [], byes: [], error: "Check the date range, time window, and slot length." };

  const rounds = roundRobin(cleanTeams);
  if (rounds.length > dates.length) {
    return { slots: [], byes: [], error: `Need at least ${rounds.length} play date(s) for ${cleanTeams.length} teams.` };
  }

  const dayCapacity = courtIds.length * slotTimes.length;
  const maxMatchesInDay = Math.max(...rounds.map((r) => r.length));
  if (dayCapacity < maxMatchesInDay) {
    return { slots: [], byes: [], error: `Need ${maxMatchesInDay} court slot(s) per play date for ${cleanTeams.length} teams.` };
  }

  const spacing = rounds.length > 1 ? Math.max(1, Math.floor((dates.length - 1) / (rounds.length - 1))) : 1;
  const slots: SlotAssignment[] = [];
  const byes: { team: string; date: string }[] = [];

  rounds.forEach((pairings, roundIdx) => {
    const date = dates[Math.min(roundIdx * spacing, dates.length - 1)];
    pairings.forEach((pair, matchIdx) => {
      slots.push({
        home: pair.home,
        away: pair.away,
        courtId: courtIds[matchIdx % courtIds.length],
        startTime: slotTimes[Math.floor(matchIdx / courtIds.length)],
        date,
      });
    });

    if (cleanTeams.length % 2 === 1) {
      const playing = new Set(pairings.flatMap((p) => [p.home, p.away]));
      const byeTeam = cleanTeams.find((team) => !playing.has(team));
      if (byeTeam) byes.push({ team: byeTeam, date });
    }
  });

  return { slots, byes };
}
