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
 * Generate `count` consecutive play-day dates starting on/after `startDate`,
 * honouring `allowedDows`. Used when no end date is supplied — the scheduler
 * walks forward week by week until it has enough matchdays.
 */
function nextNPlayDates(startDate: string, count: number, allowedDows?: number[]): string[] {
  if (count <= 0) return [];
  const out: string[] = [];
  const filter = allowedDows && allowedDows.length > 0 ? new Set(allowedDows) : null;
  let cur = parse(startDate, "yyyy-MM-dd", new Date());
  const hardCap = count * 14 + 366;
  let steps = 0;
  while (out.length < count && steps < hardCap) {
    if (!filter || filter.has(cur.getDay())) out.push(format(cur, "yyyy-MM-dd"));
    cur = addMinutes(cur, 24 * 60);
    steps++;
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
  rotateCourts: boolean = false,
): RoundRobinAllocation {
  const cleanTeams = [...new Set(teams.filter(Boolean))];
  if (cleanTeams.length < 2) return { slots: [], byes: [], error: "Select at least 2 teams to distribute." };
  if (!courtIds.length) return { slots: [], byes: [], error: "No courts assigned to this round." };
  const rounds = roundRobin(cleanTeams);
  // If no explicit end date, generate exactly enough play dates for the round-robin.
  const openEnded = !endDate || endDate === startDate;
  const dates = startDate
    ? (openEnded
        ? nextNPlayDates(startDate, rounds.length, playDows)
        : eachDate(startDate, endDate!, playDows))
    : [format(new Date(), "yyyy-MM-dd")];
  const slotTimes = buildSlotTimes(startTime, endTime, slotMinutes);
  if (!dates.length || !slotTimes.length) return { slots: [], byes: [], error: "Check the start date, time window, and slot length." };



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
      // When rotateCourts is on, shift the court index by the round number so
      // teams move between courts week-to-week instead of always playing on the
      // same court.
      const courtIdx = rotateCourts
        ? (matchIdx + roundIdx) % courtIds.length
        : matchIdx % courtIds.length;
      slots.push({
        home: pair.home,
        away: pair.away,
        courtId: courtIds[courtIdx],
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

// ─────────────────────────────────────────────────────────────────────────────
// Prior-round helpers (read-only on prior rounds — never mutate them)
// ─────────────────────────────────────────────────────────────────────────────

export type PriorFixture = {
  home_team_code: string;
  away_team_code: string;
  court_id: number | null;
  fixture_date?: string | null;
  start_time?: string | null;
  round_id?: string | null;
  round_number?: number | null;
  round_name?: string | null;
};

/** team_code → (court_id → times played on that court) */
export type CourtUsage = Map<string, Map<number, number>>;

export function buildPriorCourtUsage(prior: PriorFixture[], teamSet?: Set<string>): CourtUsage {
  const usage: CourtUsage = new Map();
  for (const f of prior) {
    if (!f.court_id || f.away_team_code === "__BYE__") continue;
    for (const team of [f.home_team_code, f.away_team_code]) {
      if (teamSet && !teamSet.has(team)) continue;
      let inner = usage.get(team);
      if (!inner) { inner = new Map(); usage.set(team, inner); }
      inner.set(f.court_id, (inner.get(f.court_id) ?? 0) + 1);
    }
  }
  return usage;
}

const usageScore = (u: CourtUsage, team: string, court: number): number =>
  u.get(team)?.get(court) ?? 0;

/**
 * Reverse home/away for the most recent prior round whose pairings cover the
 * supplied team set. Returns swapped Pairing[] or null if no suitable round.
 */
export function reversePairingsFromPrior(
  prior: PriorFixture[],
  teamSet: Set<string>,
): Pairing[] | null {
  const byRound = new Map<string, PriorFixture[]>();
  for (const f of prior) {
    if (!f.round_id || f.away_team_code === "__BYE__") continue;
    if (!teamSet.has(f.home_team_code) || !teamSet.has(f.away_team_code)) continue;
    const arr = byRound.get(f.round_id) ?? [];
    arr.push(f);
    byRound.set(f.round_id, arr);
  }
  if (!byRound.size) return null;
  let best: { pairings: Pairing[]; rn: number } | null = null;
  for (const fixtures of byRound.values()) {
    const teamsInRound = new Set<string>();
    fixtures.forEach((f) => { teamsInRound.add(f.home_team_code); teamsInRound.add(f.away_team_code); });
    let covers = true;
    for (const t of teamSet) if (!teamsInRound.has(t)) { covers = false; break; }
    if (!covers) continue;
    const rn = fixtures[0].round_number ?? 0;
    const pairings: Pairing[] = fixtures.map((f) => ({ home: f.away_team_code, away: f.home_team_code }));
    if (!best || rn > best.rn) best = { pairings, rn };
  }
  return best?.pairings ?? null;
}

/**
 * Allocate batches of pairings across dates × time slots × courts, picking the
 * court that minimises combined prior+current usage for the two teams.
 */
export function allocatePairingsWithCourtFairness(
  pairingBatches: Pairing[][],
  courtIds: number[],
  startTime: string,
  endTime: string,
  slotMinutes: number,
  startDate: string,
  endDate: string,
  playDows: number[] | undefined,
  priorUsage: CourtUsage,
): RoundRobinAllocation {
  if (!courtIds.length) return { slots: [], byes: [], error: "No courts assigned to this round." };
  const openEnded = !endDate || endDate === startDate;
  const dates = openEnded
    ? nextNPlayDates(startDate, pairingBatches.length, playDows)
    : eachDate(startDate, endDate, playDows);
  const slotTimes = buildSlotTimes(startTime, endTime, slotMinutes);
  if (!dates.length || !slotTimes.length) return { slots: [], byes: [], error: "Check the start date, time window, and slot length." };
  if (pairingBatches.length > dates.length) {
    return { slots: [], byes: [], error: `Need at least ${pairingBatches.length} play date(s).` };
  }
  const spacing = pairingBatches.length > 1 ? Math.max(1, Math.floor((dates.length - 1) / (pairingBatches.length - 1))) : 1;
  const usage: CourtUsage = new Map();
  for (const [team, inner] of priorUsage) usage.set(team, new Map(inner));

  const slots: SlotAssignment[] = [];
  let overflowCounter = 0;
  pairingBatches.forEach((batch, batchIdx) => {
    let dateIdx = Math.min(batchIdx * spacing, dates.length - 1);
    let timeIdx = 0;
    let usedAtSlot = new Set<number>();
    const advanceSlot = (): boolean => {
      if (timeIdx < slotTimes.length - 1) {
        timeIdx++;
      } else if (dateIdx < dates.length - 1) {
        dateIdx++;
        timeIdx = 0;
      } else {
        return false; // capacity exhausted
      }
      usedAtSlot = new Set();
      return true;
    };
    for (const pair of batch) {
      if (usedAtSlot.size >= courtIds.length) advanceSlot();
      const date = dates[dateIdx];
      const time = slotTimes[timeIdx];
      let bestCourt = -1;
      let bestScore = Infinity;
      for (const c of courtIds) {
        if (usedAtSlot.has(c)) continue;
        const score = usageScore(usage, pair.home, c) + usageScore(usage, pair.away, c);
        if (score < bestScore) { bestScore = score; bestCourt = c; }
      }
      if (bestCourt === -1) {
        // capacity truly exhausted — keep rotating courts visibly
        bestCourt = courtIds[overflowCounter % courtIds.length];
        overflowCounter++;
      } else {
        usedAtSlot.add(bestCourt);
      }
      slots.push({ home: pair.home, away: pair.away, courtId: bestCourt, startTime: time, date });
      for (const team of [pair.home, pair.away]) {
        let inner = usage.get(team);
        if (!inner) { inner = new Map(); usage.set(team, inner); }
        inner.set(bestCourt, (inner.get(bestCourt) ?? 0) + 1);
      }
    }
  });
  return { slots, byes: [] };
}

/**
 * Re-balance courts on already-saved fixtures in a single round. Only court_id
 * changes; pairings, dates, and times stay locked.
 */
export function fairCourtAssignmentForExistingFixtures<T extends PriorFixture & { id?: string }>(
  fixtures: T[],
  courtIds: number[],
  priorUsage: CourtUsage,
): { id?: string; court_id: number }[] {
  const usage: CourtUsage = new Map();
  for (const [team, inner] of priorUsage) usage.set(team, new Map(inner));
  const groups = new Map<string, T[]>();
  for (const f of fixtures) {
    if (!f.fixture_date || !f.start_time || f.away_team_code === "__BYE__") continue;
    const key = `${f.fixture_date}|${String(f.start_time).slice(0, 5)}`;
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }
  const out: { id?: string; court_id: number }[] = [];
  let overflowCounter = 0;
  for (const group of groups.values()) {
    const used = new Set<number>();
    for (const f of group) {
      let bestCourt = -1;
      let bestScore = Infinity;
      for (const c of courtIds) {
        if (used.has(c)) continue;
        const score = usageScore(usage, f.home_team_code, c) + usageScore(usage, f.away_team_code, c);
        if (score < bestScore) { bestScore = score; bestCourt = c; }
      }
      if (bestCourt === -1) {
        bestCourt = courtIds[overflowCounter % courtIds.length];
        overflowCounter++;
      } else {
        used.add(bestCourt);
      }
      out.push({ id: f.id, court_id: bestCourt });
      for (const team of [f.home_team_code, f.away_team_code]) {
        let inner = usage.get(team);
        if (!inner) { inner = new Map(); usage.set(team, inner); }
        inner.set(bestCourt, (inner.get(bestCourt) ?? 0) + 1);
      }
    }
  }
  return out;
}

/**
 * Infer tier groups from prior fixtures. Each team is bucketed by the name of
 * the most recent prior round it appeared in.
 */
export function inferTiersFromPriorFixtures(
  prior: PriorFixture[],
): Map<string, string[]> {
  const sorted = [...prior].sort((a, b) => (b.round_number ?? 0) - (a.round_number ?? 0));
  const teamTier = new Map<string, string>();
  for (const f of sorted) {
    if (f.away_team_code === "__BYE__") continue;
    const tier = f.round_name || `Round ${f.round_number ?? "?"}`;
    if (!teamTier.has(f.home_team_code)) teamTier.set(f.home_team_code, tier);
    if (!teamTier.has(f.away_team_code)) teamTier.set(f.away_team_code, tier);
  }
  const out = new Map<string, string[]>();
  for (const [team, tier] of teamTier) {
    const arr = out.get(tier) ?? [];
    arr.push(team);
    out.set(tier, arr);
  }
  return out;
}

