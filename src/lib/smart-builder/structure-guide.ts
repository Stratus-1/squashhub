/**
 * Step-by-Step Beta: advisory competition-structure guidance per category.
 *
 * Purely advisory: compares round robin, pools (+ playoffs), knockout and Swiss against the organiser's
 * goal, opponent preference, broad time capacity and the (estimated or actual) field size. Never decides
 * anything by itself — the builder only applies a recommendation when the organiser clicks "Use".
 * Match format (how one match is scored) is out of scope. Pure: no IO.
 */
import { recommendPools } from "./pool-plan";

export type GuideOutcome = "winner" | "rank" | "balanced";
export type GuideStrength = "broad" | "similar";
export type GuideTime = "plenty" | "some" | "tight";
export type StructureKind = "round_robin" | "pools" | "knockout" | "swiss";

export interface GuideAnswers {
  knowsEntries?: boolean | null;
  /** Per category name: approximate expected entries (estimate only). */
  expected?: Record<string, string>;
  outcome?: GuideOutcome | null;
  strength?: GuideStrength | null;
  time?: GuideTime | null;
  /** Question 4 capacity inputs (strings as typed). Legacy `time` is still read when these are absent. */
  courts?: string;
  hoursPerCourt?: string;
  sessionDays?: string;
  matchMinutes?: string;
  /** Category → structure the organiser accepted from a recommendation. */
  applied?: Record<string, StructureKind>;
  /** Category → actual field size the organiser already reviewed (silences the re-evaluation prompt). */
  reviewedActual?: Record<string, number>;
}

export interface GuideInput {
  n: number;
  outcome: GuideOutcome | null | undefined;
  strength: GuideStrength | null | undefined;
  time: GuideTime | null | undefined;
  isChamps?: boolean;
  /** Match slots this category may fairly use (its share of tournament capacity). */
  slots?: number | null;
  /** Expected match duration (minutes) for court-hour estimates. */
  matchMinutes?: number;
}

export type CapacityFit = "fits" | "tight" | "exceeds";
export const DEFAULT_MATCH_MINUTES = 45;

/** Broad capacity from Question 4: total court-hours and match slots. Null until courts/hours/days are entered. */
export function guideCapacity(g: GuideAnswers | null | undefined): { courtHours: number; slots: number; matchMinutes: number } | null {
  const courts = Number(g?.courts), hours = Number(g?.hoursPerCourt), days = Number(g?.sessionDays);
  const matchMinutes = Number(g?.matchMinutes) > 0 ? Number(g!.matchMinutes) : DEFAULT_MATCH_MINUTES;
  if (!(courts > 0 && hours > 0 && days > 0)) return null;
  const courtHours = courts * hours * days;
  return { courtHours, slots: Math.floor((courtHours * 60) / matchMinutes), matchMinutes };
}

export function capacityFit(demand: number, slots: number): CapacityFit {
  if (demand <= slots * 0.85) return "fits";
  return demand <= slots ? "tight" : "exceeds";
}

/** Split tournament slots across categories in proportion to their field's round-robin demand (never gives each the full total). */
export function shareSlots(fields: Record<string, number>, slots: number): Record<string, number> {
  const w = Object.fromEntries(Object.entries(fields).map(([k, n]) => [k, n >= 2 ? (n * (n - 1)) / 2 : 0]));
  const tot = Object.values(w).reduce((t, x) => t + x, 0);
  return Object.fromEntries(Object.keys(fields).map((k) => [k, tot ? Math.floor((slots * w[k]) / tot) : 0]));
}

export interface StructureOption {
  kind: StructureKind;
  title: string;
  why: string;
  /** Preliminary rounds before any playoff (each player plays at most once per round). */
  rounds: number;
  playoffRounds: number;
  matches: number;
  /** Preliminary / pool matches and playoff matches (matches = both). */
  prelimMatches: number;
  playoffMatches: number;
  /** Approximate court-hours at the entered match duration. */
  courtHours: number;
  /** Set only when capacity is known. */
  fit?: CapacityFit;
  perPlayer: string;
  pools?: number[];
  playoff?: "placement" | "semis" | null;
  score: number;
}

export const STRUCTURE_LABEL: Record<StructureKind, string> = {
  round_robin: "Single round robin",
  pools: "Round-robin pools + playoffs",
  knockout: "Knockout",
  swiss: "Swiss pairing",
};

/** Rough round capacity a field can absorb for each broad time answer. */
const ROUND_CAP: Record<GuideTime, number> = { plenty: 11, some: 7, tight: 4 };

const rrRounds = (s: number) => (s < 2 ? 0 : s % 2 ? s : s - 1);
const rrMatches = (s: number) => (s * (s - 1)) / 2;
const log2c = (n: number) => Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));

/** Pool size preference: smaller pools when time is tight, larger when ranking broadly matters. */
function poolTarget(inp: GuideInput, time: GuideTime): number {
  if (time === "tight") return 4;
  if (time === "plenty" && (inp.outcome === "rank" || inp.strength === "broad")) return 6;
  return 5;
}

export function evaluateStructures(inp: GuideInput): StructureOption[] {
  const n = Math.floor(inp.n);
  if (!Number.isFinite(n) || n < 2) return [];
  const slots = inp.slots != null && inp.slots > 0 ? inp.slots : null;
  // Capacity known → derive the time band from the maths (share vs a full round robin); else legacy answer.
  const time: GuideTime = slots != null ? (slots >= rrMatches(n) ? "plenty" : slots >= rrMatches(n) / 2 ? "some" : "tight") : (inp.time ?? "some");
  const cap = slots != null ? Infinity : ROUND_CAP[time];
  const mm = inp.matchMinutes && inp.matchMinutes > 0 ? inp.matchMinutes : DEFAULT_MATCH_MINUTES;
  const outcome = inp.outcome ?? "balanced";
  const strength = inp.strength ?? null;
  const rankWeight = inp.isChamps && outcome === "rank" ? 2 : 1.4;
  const out: StructureOption[] = [];

  const fit = (kind: StructureKind, rounds: number, sizeFit: number, matches = 0) => {
    const o: Record<GuideOutcome, Record<StructureKind, number>> = {
      rank: { round_robin: 3, pools: 3, swiss: 2, knockout: 0 },
      winner: { round_robin: 1, pools: 2, swiss: 1, knockout: 3 },
      balanced: { round_robin: 2, pools: 3, swiss: 2, knockout: 1 },
    };
    const s: Record<GuideStrength, Record<StructureKind, number>> = {
      broad: { round_robin: 3, pools: 2, swiss: 0, knockout: 0 },
      similar: { round_robin: 0, pools: 2, swiss: 3, knockout: 1 },
    };
    const excess = Math.max(0, rounds - cap);
    const capPen = slots == null ? 0 : (() => { const f = capacityFit(matches, slots); return f === "fits" ? 0 : f === "tight" ? 1 : 8 + Math.min(4, matches / slots); })();
    return -capPen +  o[outcome][kind] * (outcome === "rank" ? rankWeight : 1.4) + (strength ? s[strength][kind] : 0) + sizeFit - Math.min(8, excess * 1.5);
  };

  // Single round robin
  {
    const r = rrRounds(n);
    const sizeFit = n <= 6 ? 3 : n <= 8 ? 2 : n <= 10 ? 0 : -4;
    const m = rrMatches(n);
    out.push({ kind: "round_robin", title: STRUCTURE_LABEL.round_robin, rounds: r, playoffRounds: 0, matches: m, prelimMatches: m, playoffMatches: 0, courtHours: 0, perPlayer: `${n - 1} matches each`, why: "", playoff: null, score: fit("round_robin", r, sizeFit, m) });
  }
  // Pools (+ placement/semifinal playoffs)
  if (n >= 6) {
    const pools = recommendPools(n, poolTarget(inp, time));
    if (pools.length > 1) {
      const maxP = Math.max(...pools), minP = Math.min(...pools);
      const r = rrRounds(maxP);
      const placement = outcome === "rank" || (outcome === "balanced" && strength === "similar");
      const pr = placement ? 1 : pools.length >= 4 ? 3 : 2;
      const prelim = pools.reduce((t, s) => t + rrMatches(s), 0);
      const po = placement ? Math.floor(n / 2) : pools.length >= 4 ? 7 : 3;
      const pm = prelim + po;
      const sizeFit = n >= 8 ? 2 : 1;
      out.push({ kind: "pools", title: `${pools.length} round-robin pools + ${placement ? "positional playoffs" : "semifinals & final"}`, rounds: r, playoffRounds: pr, matches: pm, prelimMatches: prelim, playoffMatches: po, courtHours: 0, perPlayer: `${minP === maxP ? maxP - 1 : `${minP - 1}–${maxP - 1}`} pool matches${placement ? " + 1 placement match" : " + playoffs for qualifiers"}`, pools, playoff: placement ? "placement" : "semis", why: "", score: fit("pools", r + pr, sizeFit, pm) });
    }
  }
  // Knockout
  if (n >= 4) {
    const r = log2c(n);
    out.push({ kind: "knockout", title: STRUCTURE_LABEL.knockout, rounds: r, playoffRounds: 0, matches: n - 1, prelimMatches: 0, playoffMatches: n - 1, courtHours: 0, perPlayer: `1–${r} matches (half the field plays once)`, playoff: null, why: "", score: fit("knockout", r, n >= 8 ? 1 : 0, n - 1) });
  }
  // Swiss
  if (n >= 6) {
    const r = Math.min(n - 1, log2c(n) + (outcome === "rank" ? 2 : 1));
    const sizeFit = n >= 16 ? 3 : n >= 10 ? 1 : -2;
    const m = Math.floor(n / 2) * r;
    out.push({ kind: "swiss", title: STRUCTURE_LABEL.swiss, rounds: r, playoffRounds: 0, matches: m, prelimMatches: m, playoffMatches: 0, courtHours: 0, perPlayer: `${r} matches each`, playoff: null, why: "", score: fit("swiss", r, sizeFit, m) });
  }

  for (const x of out) {
    x.courtHours = Math.round((x.matches * mm) / 6) / 10;
    if (slots != null) x.fit = capacityFit(x.matches, slots);
    x.why = explain(x, n, inp, cap);
  }
  return out.sort((p, q) => q.score - p.score);
}

function explain(x: StructureOption, n: number, inp: GuideInput, cap: number): string {
  const goal = inp.outcome === "rank" ? "you want the whole field ranked meaningfully" : inp.outcome === "winner" ? "you mainly want a champion efficiently" : "you want a winner and meaningful matches for everyone";
  const time = x.fit === "exceeds" ? ` It needs about ${x.matches} matches — more than this category's share of your court time.`
    : x.fit === "tight" ? " It only just fits this category's share of your court time."
    : (x.rounds + x.playoffRounds) > cap ? ` It needs more rounds (${x.rounds + x.playoffRounds}) than your time comfortably allows.` : "";
  switch (x.kind) {
    case "round_robin":
      return n <= 8 ? `With ${n} entries everyone can play everyone — the fairest ranking, and ${goal}.${time}` : `Everyone plays everyone, but ${n} entries means ${x.rounds} rounds.${time}`;
    case "pools":
      return `${x.pools!.length} pools of ${x.pools!.join("/")} give every player several competitive matches${inp.strength === "similar" ? " (pools can be banded by strength)" : ""}, then ${x.playoff === "placement" ? "positional playoffs (1st v 1st, 2nd v 2nd…) rank the full field" : "the top players meet in semifinals and a final"} — fits as ${goal}.${time}`;
    case "knockout":
      return `Finds a champion in ${x.rounds} rounds with only ${n - 1} matches, but half the field plays once and it does not rank everyone.${inp.outcome === "rank" ? " Weak fit for ranking the field." : ""}${time}`;
    case "swiss":
      return `Everyone plays ${x.rounds} rounds against opponents on similar results — no one is eliminated, useful for a large field with limited rounds.${n < 10 ? " With a small field, pairings repeat quickly." : ""}${time}`;
  }
}

/** True when the actual field differs enough from the estimate to warrant a review. */
export function materiallyDifferent(estimate: number, actual: number): boolean {
  if (!estimate || !actual) return false;
  const d = Math.abs(actual - estimate);
  return d >= 3 && d / estimate >= 0.25;
}
