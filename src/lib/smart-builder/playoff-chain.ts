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

export type PlannedEntry = { name: string; plan: PlannedPlayoff };
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
export function buildPlayoffChain(main: PlannedStage, version: string, planned: PlannedEntry[], opts: { forceConfirm?: boolean } = {}): ChainResult {
  const notes: string[] = [];
  if (!planned.length) return { stages: [], reason: null, notes };
  if (planned.length > 3) return { stages: [], reason: "More than three play-off stages can't be mapped automatically.", notes };
  let pools: number, poolSize: number;
  if (main.kind === "mapped" && main.mapping?.source === "seed_pools") { pools = main.mapping.pools; poolSize = main.mapping.poolSize; }
  else if (main.kind === "pools" || main.kind === "round_robin") {
    pools = main.kind === "pools" ? main.pools ?? 1 : 1;
    poolSize = main.poolMembers?.length ? Math.min(...main.poolMembers.map((p) => p.length)) : main.poolSize ?? 0;
  } else return { stages: [], reason: `Play-offs after a ${main.kind} stage are set up when it finishes.`, notes };
  const first = planned[0];
  const g = 2 ** (planned.length - 1);
  const pairing = first.plan.pairing ?? "later";
  let games: Array<[[number, number], [number, number]]>;
  if (pools === 2 && pairing === "crossover") games = crossoverPairs(g);
  else if (pools === 2 && pairing === "same_position") games = Array.from({ length: g }, (_, i) => [[0, i + 1], [1, i + 1]] as [[number, number], [number, number]]);
  else if (pools === 1 && (pairing === "seeded" || pairing === "crossover" || pairing === "same_position")) {
    if (pairing !== "seeded") notes.push(`${first.name}: one group only — seeded 1 v ${2 * g} pairing is used.`);
    games = seededPairs(2 * g).map(([a, b]) => [[0, a], [0, b]]);
  } else if (pairing === "later" || pairing === "winners") return { stages: [], reason: `${first.name}: choose who plays whom (pairing) in Stages & Scheduling.`, notes };
  else return { stages: [], reason: `${first.name}: "${pairing}" pairing with ${pools} groups can't be mapped automatically — set it up when the main stage finishes.`, notes };
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
