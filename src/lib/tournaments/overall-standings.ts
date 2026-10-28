/**
 * Overall finishing order for one category: play-off results first, then the rest by their
 * Swiss/pool finish. Pure.
 *  - Each bracket (top half, then bottom half) fills its places from the final backwards:
 *    final winner, final loser, then losers of each earlier round, better seed first.
 *  - Everyone who didn't play a bracket follows in seed order (final Swiss / pool order).
 *  - `complete` is false while any play-off game is still undecided (the order is provisional).
 */
export interface KoGame { bracket: number; round: number; a: string | null; b: string | null; winner: string | null }
export interface OverallRow { place: number; id: string; how: string }

export function overallStandings(seedOrder: string[], games: KoGame[]): { rows: OverallRow[]; complete: boolean } {
  const seed = (id: string) => { const i = seedOrder.indexOf(id); return i < 0 ? 9999 : i; };
  const bySeed = (x: string, y: string) => seed(x) - seed(y);
  const rows: OverallRow[] = [];
  const placed = new Set<string>();
  let complete = true;
  const brackets = [...new Set(games.map((g) => g.bracket))].sort((a, b) => a - b);
  for (const b of brackets) {
    const mine = games.filter((g) => g.bracket === b);
    const label = brackets.length > 1 ? (b === 1 ? "Top half" : "Bottom half") : "Play-offs";
    const rounds = [...new Set(mine.map((g) => g.round))].sort((x, y) => y - x); // final first
    const players = [...new Set(mine.flatMap((g) => [g.a, g.b]).filter(Boolean))] as string[];
    const out: string[] = [];
    const lastRound = Math.max(...mine.map((g) => g.round));
    const roundName = (r: number) => { const left = lastRound - r; return left === 0 ? "final" : left === 1 ? "semi-final" : left === 2 ? "quarterfinal" : `round ${r}`; };
    const how = new Map<string, string>();
    for (const r of rounds) {
      const gs = mine.filter((g) => g.round === r);
      if (gs.some((g) => !g.winner)) complete = false;
      if (r === lastRound && gs.length === 1 && gs[0].winner) {
        const g = gs[0], loser = g.a === g.winner ? g.b : g.a;
        const winner = g.winner;
        if (!winner) continue;
        out.push(winner); how.set(winner, `${label} winner`);
        if (loser) { out.push(loser); how.set(loser, `${label} final`); }
        continue;
      }
      const losers = gs.filter((g) => g.winner).map((g) => (g.a === g.winner ? g.b : g.a)).filter(Boolean) as string[];
      losers.sort(bySeed).forEach((id) => { out.push(id); how.set(id, `${label} · lost ${roundName(r)}`); });
    }
    // Players still in the bracket (games not played yet) keep their seed order at the end of this bracket.
    const pending = players.filter((id) => !out.includes(id)).sort(bySeed);
    for (const id of pending) { how.set(id, `${label} · still playing`); }
    const ordered = [...out.filter((id) => !pending.includes(id)), ...pending];
    // Losers are pushed final-round first, so ordered is already best → worst except pending.
    for (const id of ordered) if (!placed.has(id)) { placed.add(id); rows.push({ place: rows.length + 1, id, how: how.get(id) ?? label }); }
  }
  for (const id of seedOrder) if (!placed.has(id)) { placed.add(id); rows.push({ place: rows.length + 1, id, how: "Rounds finish" }); }
  return { rows, complete };
}

/**
 * Ladder after applying the standings: the ladder spots the category's players already hold are
 * re-filled in finishing order; everyone else keeps their exact spot.
 */
export function ladderAfterStandings(ladder: string[], standings: string[]): string[] {
  const inCat = new Set(standings.filter((id) => ladder.includes(id)));
  const queue = [...new Set(standings.filter((id) => inCat.has(id)))];
  return ladder.map((id) => (inCat.has(id) ? queue.shift() ?? id : id));
}
