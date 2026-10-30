/**
 * Step-by-Step Beta → structured engine: planned play-off stages (Stages & Scheduling timeline) become REAL
 * predefined engine stages, so progression can run them.
 *
 *  - The stage chain is derived from the timeline order (e.g. Rounds → Semifinal → Final, or
 *    Rounds → QF → SF → Final). The organiser never says "after which stage".
 *  - The FIRST play-off stage is fed by finishing positions of the main stage, using its pairing rule
 *    (crossover / same position / seeded). Every LATER stage is fed by the WINNERS of the stage before
 *    (`stage_winners`) — never by original pool positions.
 *  - "Start this stage" maps to `generation`: automatic or owner_approval.
 *  - Schedule (date / play-by deadline, time window, courts) is carried on the stage; slots are allocated
 *    later by the scheduler against the real court diary (see playoff-schedule.ts).
 * Pure: no IO. Anything that can't be mapped safely returns a reason instead of guessing.
 */
import type { PlannedStage } from "@/lib/tournaments/contract";
import type { MappedMatch, MappedUnit, StageMapping } from "@/lib/tournaments/mapping";
import type { PlannedPlayoff } from "@/lib/tournaments/engine-service";

/** `stageKey`: the saved key of a "set up later" stage — kept so stage keys stay unique per round across categories. */
export type PlannedEntry = { name: string; plan: PlannedPlayoff; stageKey?: string };
export interface ChainResult { stages: PlannedStage[]; reason: string | null; notes: string[] }

const L = (p: number) => String.fromCharCode(65 + p);
const slot = (pool: number, position: number) => ({ pool, position });

/** Standard bracket order for a single seeded field of size n (power of two): 1v8, 4v5, 2v7, 3v6. */
export function seededPairs(n: number): Array<[number, number]> {
  let order = [1];
  while (order.length < n) { const m = order.length * 2 + 1; order = order.flatMap((s) => [s, m - s]); }
  const out: Array<[number, number]> = [];
  for (let i = 0; i < order.length; i += 2) out.push([order[i], order[i + 1]]);
  return out;
}

/** Two-pool crossover for g games, in bracket order so the two pool winners can only meet in the last game. */
export function crossoverPairs(g: number): Array<[[number, number], [number, number]]> {
  if (g === 1) return [[[0, 1], [1, 1]]];
  const top: Array<[[number, number], [number, number]]> = [], bottom: typeof top = [];
  for (let k = 1; k <= g / 2; k++) {
    const aVb: [[number, number], [number, number]] = [[0, k], [1, g + 1 - k]];
    const bVa: [[number, number], [number, number]] = [[1, k], [0, g + 1 - k]];
    if (k % 2) { top.push(aVb); bottom.push(bVa); } else { top.push(bVa); bottom.push(aVb); }
  }
  return [...top, ...bottom];
}

function mappingOf(source: StageMapping["source"], sourceStageId: string, pools: number, poolSize: number, games: Array<[[number, number], [number, number]]>): StageMapping {
  const units = new Map<string, MappedUnit>();
  const id = ([p, pos]: [number, number]) => { const k = `${L(p)}${pos}`; if (!units.has(k)) units.set(k, { id: k, slots: [slot(p, pos)] }); return k; };
  const matches: MappedMatch[] = games.map(([a, b], i) => ({ round: 1, order: i + 1, a: id(a), b: id(b) }));
  return { source, sourceStageId, pools, poolSize, discipline: "singles", units: [...units.values()], matches, derived: true };
}

function scheduleOf(p: PlannedPlayoff): PlannedStage["schedule"] | null {
  const courts = (p.courtIds ?? []).map(Number).filter(Number.isFinite);
  if (p.mode === "scheduled" && p.date) return { rule: "fixed", date: p.date, roundDates: [p.date], timeFrom: p.from || null, timeTo: p.to || null, courtIds: courts };
  if (p.mode === "play_by" && p.deadline) return { rule: "play_by", deadline: p.deadline, roundDates: [p.deadline], courtIds: courts };
  return null;
}

/**
 * Build the predefined play-off stages that follow `main`. `forceConfirm` keeps owner confirmation for
 * tournaments whose setup never chose a trigger (historical "Decide later").
 */
export function buildPlayoffChain(main: PlannedStage, version: string, planned: PlannedEntry[], opts: { forceConfirm?: boolean; qualifiers?: { perPool: number | null; runnersUp: number } | null; bottomHalf?: boolean } = {}): ChainResult {
  const notes: string[] = [];
  if (!planned.length) return { stages: [], reason: null, notes };
  if (planned.length > 3) return { stages: [], reason: "More than three play-off stages can't be mapped automatically.", notes };
  // Continuing an existing play-off (e.g. Quarterfinal already created): every later stage is played by
  // the winners of the stage before — Semifinal from Quarterfinal winners, Final from Semifinal winners.
  if (main.kind === "mapped" && (main.mapping?.source === "stage_standings" || main.mapping?.source === "stage_winners")) {
    const offset = Number(/-po(\d+)$/.exec(main.id)?.[1] ?? 0);
    const stages: PlannedStage[] = [];
    let prev = main;
    for (const [i, e] of planned.entries()) {
      const schedule = scheduleOf(e.plan);
      if (!schedule) return { stages: [], reason: `${e.name}: its date / play-by deadline is still "Decide later".`, notes };
      const n = prev.mapping!.matches.length;
      if (n < 2) return { stages: [], reason: `${prev.name} is already the final.`, notes };
      const auto = !opts.forceConfirm && e.plan.trigger === "auto";
      const st: PlannedStage = {
        id: e.stageKey ?? `${version}-po${offset + i + 1}`, order: main.order + i + 1, kind: "mapped", name: e.name, discipline: main.discipline, schedule,
        mapping: mappingOf("stage_winners", prev.id, 1, n, Array.from({ length: n / 2 }, (_, k) => [[0, 2 * k + 1], [0, 2 * k + 2]] as [[number, number], [number, number]])),
        progression: { mode: "all_continue", standings: "reset" } as any, generation: auto ? "automatic" : "owner_approval", waitForOrganiser: !auto,
      };
      stages.push(st);
      prev = st;
    }
    return { stages, reason: null, notes };
  }
  let pools: number, poolSize: number;
  if (main.kind === "mapped" && main.mapping?.source === "seed_pools") { pools = main.mapping.pools; poolSize = main.mapping.poolSize; }
  else if (main.kind === "pools" || main.kind === "round_robin") {
    // A round-robin main stage can hold several pools (poolMembers has one entry per pool). Its saved
    // pairing (crossover / same position / seeded) pairs ACROSS those pools — collapsing them into one
    // ranked list turned "A1 v B2, B1 v A2" into 1 v 4 / 2 v 3 inside the first pool.
    pools = main.kind === "pools" ? main.pools ?? 1 : main.poolMembers?.length ?? 1;
    poolSize = main.poolMembers?.length ? Math.min(...main.poolMembers.map((p) => p.length)) : main.poolSize ?? 0;
  } else if (main.kind === "swiss") {
    // Swiss is one ranked list: play-offs take finishing positions 1..N of the final Swiss standings.
    pools = 1; poolSize = 0;
  } else return { stages: [], reason: `Play-offs after a ${main.kind} stage are set up when it finishes.`, notes };
  const first = planned[0];
  const g = 2 ** (planned.length - 1);
  const pairing = first.plan.pairing ?? "later";
  let games: Array<[[number, number], [number, number]]>;
  const q = opts.qualifiers ?? null;
  if (q && q.runnersUp > 0) return { stages: [], reason: `${first.name}: "best runners-up" can't be mapped automatically yet — set the play-off up when the pools finish, or set best runners-up to 0.`, notes };
  if (q?.perPool && pools > 1 && q.perPool * pools !== 2 * g) return { stages: [], reason: `${first.name} needs ${2 * g} qualifiers, but ${q.perPool} from each of ${pools} pools gives ${q.perPool * pools}. Change the qualifiers per pool or the play-off stages.`, notes };
  if (pools > 2) {
    // Any number of pools: qualifiers per pool = explicit, else derived when it divides evenly.
    const per = q?.perPool ?? ((2 * g) % pools === 0 ? (2 * g) / pools : 0);
    if (!per) return { stages: [], reason: `${first.name}: ${pools} pools can't fill ${2 * g} play-off places evenly — set qualifiers in Playoffs / Progression.`, notes };
    if (pairing === "crossover" && per === 2) {
      // Pool winner v the next pool's runner-up (A1 v B2, B1 v C2 … last pool's winner v A2).
      games = Array.from({ length: pools }, (_, p) => [[p, 1], [(p + 1) % pools, 2]] as [[number, number], [number, number]]);
    } else if (pairing === "seeded" || pairing === "crossover") {
      // Highest qualifier v lowest: rank all pool winners first (A1, B1, C1 …), then runners-up, etc.
      if (pairing === "crossover") notes.push(`${first.name}: crossover with ${per} qualifiers per pool — seeded highest v lowest is used.`);
      const order: Array<[number, number]> = [];
      for (let pos = 1; pos <= per; pos++) for (let p = 0; p < pools; p++) order.push([p, pos]);
      games = seededPairs(2 * g).map(([a, b]) => [order[a - 1], order[b - 1]]);
    } else if (pairing === "later" || pairing === "winners") return { stages: [], reason: `${first.name}: choose who plays whom (pairing) in Stages & Scheduling.`, notes };
    else return { stages: [], reason: `${first.name}: "${pairing}" pairing with ${pools} pools can't be mapped automatically — use crossover or seeded.`, notes };
  }
  else if (pools === 2 && pairing === "crossover") games = crossoverPairs(g);
  else if (pools === 2 && pairing === "seeded") {
    // Two pools, seeded: rank pool winners first (A1, B1), then runners-up (A2, B2) …, highest v lowest.
    const per = q?.perPool ?? g;
    const order: Array<[number, number]> = [];
    for (let pos = 1; pos <= per; pos++) for (let p = 0; p < 2; p++) order.push([p, pos]);
    games = seededPairs(2 * g).map(([a, b]) => [order[a - 1], order[b - 1]]);
  }
  else if (pools === 2 && pairing === "same_position") games = Array.from({ length: g }, (_, i) => [[0, i + 1], [1, i + 1]] as [[number, number], [number, number]]);
  else if (pools === 1 && (pairing === "seeded" || pairing === "crossover" || pairing === "same_position")) {
    if (pairing !== "seeded") notes.push(`${first.name}: one group only — seeded 1 v ${2 * g} pairing is used.`);
    games = seededPairs(2 * g).map(([a, b]) => [[0, a], [0, b]]);
  } else if (pairing === "later" || pairing === "winners") return { stages: [], reason: `${first.name}: choose who plays whom (pairing) in Stages & Scheduling.`, notes };
  else return { stages: [], reason: `${first.name}: "${pairing}" pairing with ${pools} groups can't be mapped automatically — set it up when the main stage finishes.`, notes };
  // "Bottom half too": in one ranked list, the next 2g players play their own bracket (9 v 16, 12 v 13 …).
  // Its games follow the top games, so every later round pairs winners top-with-top and bottom-with-bottom.
  if (opts.bottomHalf && pools === 1) games = [...games, ...seededPairs(2 * g).map(([a, b]) => [[0, a + 2 * g], [0, b + 2 * g]] as [[number, number], [number, number]])];
  else if (opts.bottomHalf && pools === 2) {
    // Two pools: the next g positions per pool play their own bracket with the same pairing rule
    // (semis crossover: A1 v B2, B1 v A2, then A3 v B4, B3 v A4).
    const top = games.map(([a, b]) => [a, b] as [[number, number], [number, number]]);
    const shift = Math.max(...top.flat().map(([, pos]) => pos));
    const lower = pairing === "seeded"
      ? (() => { const order: Array<[number, number]> = []; for (let pos = shift + 1; pos <= 2 * shift; pos++) for (let p = 0; p < 2; p++) order.push([p, pos]); return seededPairs(2 * g).map(([a, b]) => [order[a - 1], order[b - 1]] as [[number, number], [number, number]]); })()
      : top.map(([a, b]) => [[a[0], a[1] + shift], [b[0], b[1] + shift]] as [[number, number], [number, number]]);
    games = [...top, ...lower];
  }
  else if (opts.bottomHalf) notes.push(`${first.name}: "Bottom half too" is only set up automatically for one ranked list or two pools.`);
  const need = Math.max(...games.flat().map(([, pos]) => pos));
  if (poolSize && need > poolSize) return { stages: [], reason: `${first.name} needs ${need} qualifiers per group, but groups have only ${poolSize}.`, notes };
  const stages: PlannedStage[] = [];
  let prev = main;
  for (const [i, e] of planned.entries()) {
    const schedule = scheduleOf(e.plan);
    if (!schedule) return { stages: [], reason: `${e.name}: its date / play-by deadline is still "Decide later".`, notes };
    const mapping = i === 0
      ? mappingOf("stage_standings", main.id, pools, poolSize || need, games)
      : (() => {
        const n = prev.mapping!.matches.length;
        if (e.plan.pairing && !["winners", "later"].includes(e.plan.pairing)) notes.push(`${e.name}: played by the ${prev.name} winners (its saved "${e.plan.pairing}" pairing does not apply after ${prev.name}).`);
        return mappingOf("stage_winners", prev.id, 1, n, Array.from({ length: n / 2 }, (_, k) => [[0, 2 * k + 1], [0, 2 * k + 2]] as [[number, number], [number, number]]));
      })();
    const st: PlannedStage = {
      id: `${version}-po${i + 1}`, order: main.order + i + 1, kind: "mapped", name: e.name, discipline: main.discipline,
      schedule, mapping, progression: { mode: "all_continue", standings: "reset" } as any,
      generation: !opts.forceConfirm && e.plan.trigger === "auto" ? "automatic" : "owner_approval",
      waitForOrganiser: !(!opts.forceConfirm && e.plan.trigger === "auto"),
    };
    stages.push(st);
    prev = st;
  }
  return { stages, reason: null, notes };
}

/* ── slot allocation inside a planned session ── */

export interface Busy { courtId: number; start: string; end: string }
const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(":").map(Number); return h * 60 + m; };
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Allocate `count` games into a session window on the given courts, earliest time first, skipping any
 * court time already taken. Returns one slot per game, or null where the window has no room left.
 */
export function allocateSlots(count: number, w: { from: string; to: string; courtIds: number[]; minutes: number; busy: Busy[] }): Array<{ courtId: number; time: string } | null> {
  const out: Array<{ courtId: number; time: string } | null> = [];
  const taken = [...w.busy];
  const end = toMin(w.to), step = Math.max(15, w.minutes);
  for (let t = toMin(w.from); t + step <= end && out.length < count; t += step) {
    for (const c of w.courtIds) {
      if (out.length >= count) break;
      const clash = taken.some((b) => b.courtId === c && toMin(b.start) < t + step && toMin(b.end) > t);
      if (clash) continue;
      out.push({ courtId: c, time: toHHMM(t) });
      taken.push({ courtId: c, start: toHHMM(t), end: toHHMM(t + step) });
    }
  }
  while (out.length < count) out.push(null);
  return out;
}

/** Games in a standard playoff round by name (Final 1, Semifinal 2, Quarterfinal 4, Round of 16 8); null when unknown. */
export function gamesForStageName(name: string): number | null {
  const n = name.toLowerCase();
  if (/quarter/.test(n)) return 4;
  if (/semi/.test(n)) return 2;
  if (/16|last 16/.test(n)) return 8;
  if (/final/.test(n)) return 1;
  return null;
}

/** Stage-specific wording for the two-pool crossover, generated from the same pairing engine the fixtures use. */
export function crossoverLabel(stageName: string): string {
  const g = gamesForStageName(stageName) ?? 2;
  const L2 = (p: number) => String.fromCharCode(65 + p);
  return "Pool crossover: " + crossoverPairs(g).map(([a, b]) => `${L2(a[0])}${a[1]} vs ${L2(b[0])}${b[1]}`).join(", ");
}

/** Same-position wording for g games: A1 vs B1, A2 vs B2… */
export function samePositionLabel(stageName: string): string {
  const g = gamesForStageName(stageName) ?? 2;
  return "Same position: " + Array.from({ length: g }, (_, i) => `A${i + 1} vs B${i + 1}`).join(", ");
}
