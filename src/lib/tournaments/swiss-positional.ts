/**
 * Positional Swiss — PURE calculation module (Phase 1, research only).
 *
 * NOT wired into the live engine, builder, UI or database. Nothing here changes existing `swiss` stages,
 * `position_swap`, Uitsig or live Riverside tournaments.
 *
 * Model (deterministic, one instance per category / Swiss pairing group):
 *  - Slots 1..N; slot 1 is best. Round 1 occupants = seed order.
 *  - Progression: a match between slots a < b sends the WINNER to slot a and the LOSER to slot b
 *    (so a lower-slotted winner swaps up; "1 v 16, 16 wins" → 16 takes slot 1, 1 drops to 16).
 *    A bye holder keeps its slot. Applied immediately per result.
 *  - Pairing: SportyHQ-style fixed slot templates — see `slotTemplate` (fold, half-fold with middle
 *    crossover, then slide in groups of 2^(r-1)). Odd N: slot N gets the bye.
 *  - Occupant-aware adjustments (only when a whole round's feeders are decided):
 *      1. Bye fairness: the bye moves up to the lowest slot whose occupant has not had a bye yet.
 *      2. Rematch avoidance (audit: zero rematches for 8/16/32 within log2(N) rounds; rare for other sizes,
 *         e.g. 10×4 had 4 in 200 simulated rounds; frequent once rounds exceed ceil(log2 N), e.g. 9×8): a repeat pairing is fixed by swapping the lower slot with the lower slot of a
 *         neighbouring pair in the same block (then any block); if no swap works the rematch is kept and reported.
 *
 * VERIFICATION STATUS
 *  - Verified from SportyHQ's public help text only: "winner takes the better slot, loser of 1v16 moves to 16".
 *  - Owner-supplied 12/14/18 maps are encoded in `SPORTYHQ_REFERENCE_MAPS` and tested: 12 and 14 match all
 *    three rounds; 18 matches rounds 1–2 (round 3 differs, accepted). Other sizes follow the same method
 *    but are NOT verified against SportyHQ.
 */

export const MIN_ENTRANTS = 8;
export const MAX_ENTRANTS = 32;

export type Pair = { round: number; a: number; b: number };          // slots, a < b
export type RoundPlan = { round: number; pairs: Pair[]; bye: number | null };

export interface CategoryPlan {
  entrants: number;
  recommendedRounds: number;
  selectedRounds: number;
  maxRounds: number;
  matchesPerRound: number;
  byesPerRound: number;
  estimatedMatches: number;
  /** Rounds beyond which repeat opponents may be unavoidable for this model. */
  cleanRounds: number;
  issues: string[];
}

const log2ceil = (n: number) => Math.ceil(Math.log2(n));

/** Per-category plan. `rounds` is the organiser's choice; recommended = ceil(log2 N). Never shared across categories. */
export function planCategory(entrants: number, rounds?: number | null): CategoryPlan {
  const issues: string[] = [];
  if (!Number.isInteger(entrants) || entrants < MIN_ENTRANTS || entrants > MAX_ENTRANTS)
    issues.push(`Positional Swiss templates cover ${MIN_ENTRANTS}–${MAX_ENTRANTS} entrants (got ${entrants}).`);
  const n = Math.max(2, Math.floor(entrants) || 2);
  const recommendedRounds = log2ceil(n);
  const maxRounds = n % 2 ? n : n - 1;
  const selectedRounds = rounds == null ? recommendedRounds : Math.floor(rounds);
  if (!Number.isFinite(selectedRounds) || selectedRounds < 1) issues.push("Rounds must be 1 or more.");
  else if (selectedRounds > maxRounds) issues.push(`${n} entrants allow at most ${maxRounds} rounds.`);
  const matchesPerRound = Math.floor(n / 2);
  return {
    entrants: n, recommendedRounds, selectedRounds, maxRounds, matchesPerRound, byesPerRound: n % 2,
    estimatedMatches: matchesPerRound * Math.max(0, selectedRounds), cleanRounds: recommendedRounds, issues,
  };
}

/** Record blocks for round r: split [1..n] by halving r-1 times; top half gets the extra slot. */
export function blocksForRound(n: number, round: number): Array<[number, number]> {
  let blocks: Array<[number, number]> = [[1, n]];
  for (let i = 1; i < round; i++) {
    blocks = blocks.flatMap(([s, e]) => {
      const len = e - s + 1;
      if (len <= 1) return [[s, e] as [number, number]];
      const top = Math.ceil(len / 2);
      return [[s, s + top - 1], [s + top, e]] as Array<[number, number]>;
    });
  }
  return blocks;
}

const fold = (slots: number[], round: number): Pair[] => {
  const out: Pair[] = [];
  for (let i = 0, j = slots.length - 1; i < j; i++, j--) out.push({ round, a: slots[i], b: slots[j] });
  return out;
};
const range = (s: number, e: number) => Array.from({ length: Math.max(0, e - s + 1) }, (_, i) => s + i);

/**
 * Fixed slot template for a round (no occupant information) — SportyHQ-style methodology,
 * checked against the owner-supplied 12/14/18-player maps (see SPORTYHQ_REFERENCE_MAPS).
 *  - Odd N: slot N takes the bye (fairness adjustment may move it); slots 1..N-1 are paired.
 *  - Round 1: fold (1 v last).
 *  - Round 2: winners half / losers half, each folded. If the halves are odd, the MIDDLE winner
 *    crosses to play the TOP loser (14 → 4v8, 18 → 5v10).
 *  - Round r ≥ 3: "slide" in groups of g = 2^(r-1): slot a plays a + g/2 (r3: 1v3, 2v4, 5v7, 6v8 …);
 *    a short tail group slides by half its own length (13v14).
 */
export function slotTemplate(n: number, round: number): RoundPlan {
  const m = n % 2 ? n - 1 : n;
  const bye = n % 2 ? n : null;
  let pairs: Pair[] = [];
  if (round <= 1) pairs = fold(range(1, m), round);
  else if (round === 2) {
    const w = m / 2;
    if (w % 2 === 0) pairs = [...fold(range(1, w), round), ...fold(range(w + 1, m), round)];
    else {
      const mid = Math.ceil(w / 2);
      pairs = [{ round, a: mid, b: w + 1 }, ...fold(range(1, w).filter((s) => s !== mid), round), ...fold(range(w + 2, m), round)];
    }
  } else {
    const g = Math.min(2 ** (round - 1), m);
    for (let s = 1; s <= m; s += g) {
      const len = Math.min(g, m - s + 1);
      const h = len / 2;
      for (let i = 0; i < h; i++) pairs.push({ round, a: s + i, b: s + i + h });
    }
  }
  return { round, pairs: pairs.sort((x, y) => x.a - y.a), bye };
}

/** Full slot template for a category (round 1..rounds). Validated by `validateTemplate`. */
export function categoryTemplate(n: number, rounds: number): RoundPlan[] {
  return Array.from({ length: rounds }, (_, i) => slotTemplate(n, i + 1));
}

export function validateTemplate(n: number, plan: RoundPlan[]): string[] {
  const out: string[] = [];
  for (const r of plan) {
    const used = r.pairs.flatMap((p) => [p.a, p.b]).concat(r.bye != null ? [r.bye] : []);
    if (used.length !== n || new Set(used).size !== n) out.push(`Round ${r.round}: every slot must appear exactly once.`);
    if (used.some((s) => s < 1 || s > n)) out.push(`Round ${r.round}: slot out of range.`);
    if (r.pairs.some((p) => p.a >= p.b)) out.push(`Round ${r.round}: pair must be better slot v worse slot.`);
    if ((n % 2 === 0) !== (r.bye == null)) out.push(`Round ${r.round}: a bye is needed exactly when entrants are odd.`);
  }
  return out;
}

/* ------------------------------------------------------------------ live state (pure) */

export type Occupants = string[];                        // index = slot-1
export interface PlayedRound { round: number; pairs: Array<{ a: string; b: string; winner: string | null }>; bye: string | null }
export interface CategoryState { occupants: Occupants; history: PlayedRound[] }

export const startState = (seedOrder: string[]): CategoryState => ({ occupants: [...seedOrder], history: [] });

const key = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
export const metBefore = (s: CategoryState) => new Set(s.history.flatMap((r) => r.pairs.map((p) => key(p.a, p.b))));
export const byesTaken = (s: CategoryState) => new Set(s.history.map((r) => r.bye).filter(Boolean) as string[]);

export interface ResolvedRound { round: number; pairs: Array<{ slotA: number; slotB: number; a: string; b: string; rematch: boolean }>; bye: { slot: number; id: string } | null; rematches: number; adjusted: boolean }

/** Pair the next round from the current occupants (call only once the previous round is fully decided). */
export function resolveRound(state: CategoryState, round: number): ResolvedRound {
  const n = state.occupants.length;
  const tpl = slotTemplate(n, round);
  const occ = (slot: number) => state.occupants[slot - 1];
  let pairs = tpl.pairs.map((p) => ({ a: p.a, b: p.b }));
  let bye = tpl.bye;
  let adjusted = false;

  // 1. Bye fairness: move the bye up to the lowest slot whose occupant hasn't had one.
  if (bye != null) {
    const had = byesTaken(state);
    if (had.has(occ(bye))) {
      for (let s = n; s >= 1; s--) {
        if (had.has(occ(s))) continue;
        const pi = pairs.findIndex((p) => p.a === s || p.b === s);
        if (pi < 0) break;
        const p = pairs[pi];
        const other = p.a === s ? p.b : p.a;
        pairs[pi] = { a: Math.min(other, bye), b: Math.max(other, bye) };
        bye = s; adjusted = true; break;
      }
    }
  }

  // 2. Rematch avoidance by swapping lower slots with neighbouring pairs (same block first).
  const met = metBefore(state);
  const isRe = (p: { a: number; b: number }) => met.has(key(occ(p.a), occ(p.b)));
  const blocks = blocksForRound(n, round);
  const blockOf = (slot: number) => blocks.findIndex(([s, e]) => slot >= s && slot <= e);
  pairs.sort((x, y) => x.a - y.a);
  for (let i = 0; i < pairs.length; i++) {
    if (!isRe(pairs[i])) continue;
    const order = pairs.map((_, j) => j).filter((j) => j !== i)
      .sort((x, y) => Number(blockOf(pairs[x].a) !== blockOf(pairs[i].a)) - Number(blockOf(pairs[y].a) !== blockOf(pairs[i].a)) || Math.abs(x - i) - Math.abs(y - i));
    for (const j of order) {
      const p = pairs[i], q = pairs[j];
      const np = { a: Math.min(p.a, q.b), b: Math.max(p.a, q.b) }, nq = { a: Math.min(q.a, p.b), b: Math.max(q.a, p.b) };
      if (!isRe(np) && !isRe(nq)) { pairs[i] = np; pairs[j] = nq; adjusted = true; break; }
    }
  }
  pairs.sort((x, y) => x.a - y.a);
  const out = pairs.map((p) => ({ slotA: p.a, slotB: p.b, a: occ(p.a), b: occ(p.b), rematch: isRe(p) }));
  return { round, pairs: out, bye: bye != null ? { slot: bye, id: occ(bye) } : null, rematches: out.filter((p) => p.rematch).length, adjusted };
}

/** Apply one confirmed result immediately: winner → better slot, loser → worse slot. Idempotent. */
export function applyResult(occupants: Occupants, slotA: number, slotB: number, winner: string): Occupants {
  const a = Math.min(slotA, slotB), b = Math.max(slotA, slotB);
  const pa = occupants[a - 1], pb = occupants[b - 1];
  if (winner !== pa && winner !== pb) throw new Error("Winner is not in this match.");
  const next = [...occupants];
  next[a - 1] = winner; next[b - 1] = winner === pa ? pb : pa;
  return next;
}

/**
 * Next-round opponent visibility before the round is generated. Slot s in round r+1 is fed by exactly one
 * round-r match (or the bye). A fixture is "ready" only when both feeders are decided; it stays "provisional"
 * until the whole round is decided because bye/rematch adjustments may still change it.
 */
export function nextRoundPreview(n: number, round: number, decided: (slot: number) => boolean) {
  const cur = slotTemplate(n, round);
  const feeder = new Map<number, { a: number; b: number } | "bye">();
  cur.pairs.forEach((p) => { feeder.set(p.a, p); feeder.set(p.b, p); });
  if (cur.bye != null) feeder.set(cur.bye, "bye");
  const done = (slot: number) => { const f = feeder.get(slot); return f === "bye" || (!!f && decided(f.a)); };
  const allDone = [...Array(n)].every((_, i) => done(i + 1));
  return slotTemplate(n, round + 1).pairs.map((p) => {
    const a = done(p.a), b = done(p.b);
    return { slotA: p.a, slotB: p.b, status: a && b ? (allDone ? "ready" : "provisional") : a || b ? "one_side_pending" : "both_pending" } as const;
  });
}

/** Final positional ranking = final slot order. */
export const finalRanking = (s: CategoryState) => s.occupants.map((id, i) => ({ position: i + 1, id }));

/** Pure simulator used by tests/audits: `pickWinner` decides each match deterministically. */
export function simulateCategory(seedOrder: string[], rounds: number, pickWinner: (a: string, b: string, round: number) => string) {
  let state = startState(seedOrder);
  const resolved: ResolvedRound[] = [];
  for (let r = 1; r <= rounds; r++) {
    const rr = resolveRound(state, r);
    resolved.push(rr);
    let occ = state.occupants;
    const played: PlayedRound = { round: r, pairs: [], bye: rr.bye?.id ?? null };
    for (const p of rr.pairs) {
      const w = pickWinner(p.a, p.b, r);
      played.pairs.push({ a: p.a, b: p.b, winner: w });
      occ = applyResult(occ, p.slotA, p.slotB, w);
    }
    state = { occupants: occ, history: [...state.history, played] };
  }
  return { state, resolved };
}

/** Owner-supplied SportyHQ maps go here as data: { [entrants]: { [round]: [slotA, slotB][] } }. Empty = unverified. */
/**
 * Owner-supplied SportyHQ maps (screenshots, 14 Oct 2026), transcribed as data.
 * 12 and 14: rounds 1–3 match exactly. 18: rounds 1–2 match exactly; SportyHQ round 3 differs at the
 * top (1v4, 2v3, 5v6 …) and the screenshot's final pairs were cut off — owner accepted round 3 variation.
 */
export const SPORTYHQ_REFERENCE_MAPS: Record<number, Record<number, Array<[number, number]>>> = {
  12: {
    1: [[1, 12], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]],
    2: [[1, 6], [2, 5], [3, 4], [7, 12], [8, 11], [9, 10]],
    3: [[1, 3], [2, 4], [5, 7], [6, 8], [9, 11], [10, 12]],
  },
  14: {
    1: [[1, 14], [2, 13], [3, 12], [4, 11], [5, 10], [6, 9], [7, 8]],
    2: [[1, 7], [2, 6], [3, 5], [4, 8], [9, 14], [10, 13], [11, 12]],
    3: [[1, 3], [2, 4], [5, 7], [6, 8], [9, 11], [10, 12], [13, 14]],
  },
  18: {
    1: [[1, 18], [2, 17], [3, 16], [4, 15], [5, 14], [6, 13], [7, 12], [8, 11], [9, 10]],
    2: [[1, 9], [2, 8], [3, 7], [4, 6], [5, 10], [11, 18], [12, 17], [13, 16], [14, 15]],
  },
};
/** SportyHQ 18-player round 3 as visible (last pair inferred) — informational, intentionally not matched. */
export const SPORTYHQ_18_ROUND3_OBSERVED: Array<[number, number]> = [[1, 4], [2, 3], [5, 6], [7, 9], [8, 10], [11, 13], [12, 14], [15, 17], [16, 18]];
