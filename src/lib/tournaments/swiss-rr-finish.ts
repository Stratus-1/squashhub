/**
 * Riverside pilot: "Round robin in final 3 rounds" for a five-round Swiss stage.
 *
 * Rounds 1–2 are normal Swiss. The standing after Round 2 is the frozen snapshot (it is recomputed
 * only from Round 1–2 results, which are final by then, so it never moves). Positions 1–4, 5–8, …
 * (as many groups of 4 as the organiser chose) play a full round robin in Rounds 3–5 with fixed
 * pairing positions. Everyone else carries on Swiss among themselves. Standings stay cumulative.
 * Off by default — with the toggle off nothing here runs.
 */
import { swissTable, type SwissGame, type SwissRow } from "./swiss-standings";

export type RrFinish = { enabled: boolean; groups: number; remainderChart?: "ten_position_swap" };

/** Owner-approved fixed-position chart for a 10-player remainder (local slots 1–10, R3–R5).
 * No position pair repeats; neighbours meet only in the final round. Repeat opponents are allowed. */
export const TEN_REMAINDER_CHART: Record<number, Array<[number, number]>> = {
  3: [[1, 6], [2, 7], [3, 8], [4, 9], [5, 10]],
  4: [[1, 3], [2, 5], [4, 6], [7, 9], [8, 10]],
  5: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]],
};

export const usesTenRemainderChart = (f: RrFinish | null | undefined, remainder: number) =>
  f?.remainderChart === "ten_position_swap" && remainder === 10;

/** Remainder slots entering `round`: start from the post-R2 order, then winner takes the better
 * slot of each chart pair, loser the worse. A slot is null until its deciding game is complete. */
export function tenRemainderSlots(remainder: string[], round: number, games: Array<{ a: string | null; b: string | null; winner?: string | null; round: number; state?: string }>): Array<string | null> {
  let slots: Array<string | null> = [...remainder];
  for (let r = 3; r < round; r++) {
    const next: Array<string | null> = Array(slots.length).fill(null);
    for (const [a, b] of TEN_REMAINDER_CHART[r] ?? []) {
      const x = slots[a - 1], y = slots[b - 1];
      const g = x && y ? games.find((f) => f.round === r && f.winner && ((f.a === x && f.b === y) || (f.a === y && f.b === x))) : undefined;
      if (g) { next[a - 1] = g.winner as string; next[b - 1] = g.winner === x ? y : x; }
    }
    slots = next;
  }
  return slots;
}

/** Fixed pairing labels and independent remainder ranking. Qualifying opponents' points
 * are frozen at R2: later RR results must not change the Swiss cohort's tie-breaks. */
export function hybridSwissTable(seedOrder: string[], games: SwissGame[], finish: RrFinish | null | undefined, tieBreaks?: readonly string[] | null): SwissRow[] {
  if (!rrFinishOn(finish) || !games.some((g) => (g.round ?? 0) >= RR_FINISH_FROM_ROUND)) return swissTable(seedOrder, games, tieBreaks);
  const qualifying = games.filter((g) => (g.round ?? 0) < RR_FINISH_FROM_ROUND);
  const snapshot = swissTable(seedOrder, qualifying, tieBreaks).map((r) => r.id);
  const fixedCount = rrFinishSplit(seedOrder.length, finish.groups).groupRanges.length * 4;
  const rest = new Set(snapshot.slice(fixedCount));
  const table = swissTable(seedOrder, games.filter((g) => (g.round ?? 0) < RR_FINISH_FROM_ROUND || (g.a && rest.has(g.a) && (!g.b || rest.has(g.b)))), tieBreaks);
  const stats = new Map(swissTable(seedOrder, games, tieBreaks).map((r) => [r.id, r]));
  const fixed = snapshot.slice(0, fixedCount).flatMap((id) => { const row = stats.get(id); return row ? [row] : []; });
  return [...fixed, ...table.filter((r) => rest.has(r.id))].map((r, i) => ({ ...r, position: i + 1 }));
}

export const RR_FINISH_ROUNDS = 5;
export const RR_FINISH_FROM_ROUND = 3;

/** Fixed positions inside a group of 4 for Rounds 3, 4 and 5 (every pair meets exactly once). */
export const RR_GROUP_SCHEDULE: Record<number, Array<[number, number]>> = {
  3: [[1, 4], [2, 3]],
  4: [[1, 3], [2, 4]],
  5: [[1, 2], [3, 4]],
};

export const rrFinishOn = (f: RrFinish | null | undefined): f is RrFinish => !!f?.enabled && Number(f.groups) >= 1;

/** Setup problems that stop the option from being used. Empty = feasible. */
export function rrFinishIssues(entrants: number, rounds: number | null | undefined, groups: number): string[] {
  const out: string[] = [];
  const g = Number(groups);
  if (Number(rounds) !== RR_FINISH_ROUNDS) out.push(`Round robin in the final 3 rounds needs exactly ${RR_FINISH_ROUNDS} Swiss rounds.`);
  if (!Number.isInteger(g) || g < 1) out.push("Choose at least one group of 4.");
  if (entrants > 0 && g * 4 > entrants) out.push(`${g} groups of 4 need ${g * 4} players; only ${entrants} entered.`);
  const rest = entrants - g * 4;
  if (entrants > 0 && rest === 1) out.push("That leaves one player on their own after the groups. Choose a different number of groups.");
  if (entrants > 0 && (rest === 2 || rest === 3)) out.push("That leaves too few Swiss players for three rounds without repeat opponents. Leave at least four players outside the groups, or include everyone in groups of four.");
  return out;
}

/** Which positions form the groups and which continue Swiss (1-based, from the Round 2 snapshot). */
export function rrFinishSplit(entrants: number, groups: number) {
  const g = Math.max(0, Math.min(Math.floor(groups), Math.floor(entrants / 4)));
  const groupRanges = Array.from({ length: g }, (_, i) => [i * 4 + 1, i * 4 + 4] as [number, number]);
  const remainder = entrants > g * 4 ? [g * 4 + 1, entrants] as [number, number] : null;
  return { groupRanges, remainder };
}

/**
 * Group games for one round (3–5) from the frozen Round 2 order. Returns the pairs and the ids
 * that continue Swiss in this round.
 */
export function rrFinishRound(snapshot: string[], round: number, groups: number): { pairs: Array<[string, string]>; remainder: string[] } {
  const sched = RR_GROUP_SCHEDULE[round];
  if (!sched) throw new Error(`Round ${round} is not a round-robin round.`);
  const { groupRanges } = rrFinishSplit(snapshot.length, groups);
  const pairs: Array<[string, string]> = [];
  groupRanges.forEach(([start]) => {
    const g = snapshot.slice(start - 1, start + 3);
    sched.forEach(([x, y]) => pairs.push([g[x - 1], g[y - 1]]));
  });
  return { pairs, remainder: snapshot.slice(groupRanges.length * 4) };
}

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Group pairings in Rounds 3–5 that repeat a Round 1–2 game (a round robin cannot avoid them; shown as a warning). */
export function rrFinishRepeats(snapshot: string[], groups: number, earlier: Array<[string, string | null]>): Array<{ round: number; a: string; b: string }> {
  const met = new Set(earlier.flatMap(([a, b]) => a && b ? [key(a, b)] : []));
  const out: Array<{ round: number; a: string; b: string }> = [];
  for (let r = RR_FINISH_FROM_ROUND; r <= RR_FINISH_ROUNDS; r++) {
    rrFinishRound(snapshot, r, groups).pairs.forEach(([a, b]) => { if (met.has(key(a, b))) out.push({ round: r, a, b }); });
  }
  return out;
}
