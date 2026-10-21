/**
 * Riverside pilot: "Round robin in final 3 rounds" for a five-round Swiss stage.
 *
 * Rounds 1–2 are normal Swiss. The standing after Round 2 is the frozen snapshot (it is recomputed
 * only from Round 1–2 results, which are final by then, so it never moves). Positions 1–4, 5–8, …
 * (as many groups of 4 as the organiser chose) play a full round robin in Rounds 3–5 with fixed
 * pairing positions. Everyone else carries on Swiss among themselves. Standings stay cumulative.
 * Off by default — with the toggle off nothing here runs.
 */
export type RrFinish = { enabled: boolean; groups: number };

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
