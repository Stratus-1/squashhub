/**
 * Swiss standings — the ONE ranking used both by the standings page and by next-round pairing.
 *
 * Rules (documented, deterministic):
 *  - Swiss points = match wins (1 per win, 0 per loss). Games won / game difference are informational only.
 *  - A bye (a fixture with one side and no opponent) counts as a win: +1 point, no opponent recorded.
 *  - Buchholz = sum of current Swiss points of every real opponent faced (byes add nothing).
 *  - Sonneborn-Berger = sum of current Swiss points of every real opponent BEATEN.
 *  - Tie-break order is configurable; default Buchholz → Sonneborn-Berger. Original seed is always
 *    the final tie-break, so the order is always total and never random.
 */
import type { SwissTieBreak } from "./contract";

export const DEFAULT_SWISS_TIE_BREAKS: SwissTieBreak[] = ["buchholz", "sonneborn_berger"];
export const SWISS_TIE_BREAK_LABEL: Record<SwissTieBreak, string> = {
  buchholz: "Buchholz (opponents' points)",
  sonneborn_berger: "Sonneborn-Berger (beaten opponents' points)",
  seed: "Original seed",
};

export interface SwissGame { a: string | null; b: string | null; winner: string | null }
export interface SwissRow {
  id: string;
  seed: number;
  points: number;
  wins: number;
  losses: number;
  byes: number;
  buchholz: number;
  sonnebornBerger: number;
  position: number;
}

/** Configured order (unknown/duplicate values dropped) with seed always last. Empty → default. */
export function resolveSwissTieBreaks(configured?: readonly string[] | null): SwissTieBreak[] {
  const valid = (configured ?? []).filter((k): k is SwissTieBreak => k === "buchholz" || k === "sonneborn_berger");
  const list = [...new Set(valid)];
  return [...(list.length || (configured ?? []).includes("seed") ? list : DEFAULT_SWISS_TIE_BREAKS), "seed"];
}

export function swissTable(seedOrder: string[], games: SwissGame[], tieBreaks?: readonly string[] | null): SwissRow[] {
  const seed = new Map(seedOrder.map((id, i) => [id, i + 1]));
  const rows = new Map<string, SwissRow>(seedOrder.map((id, i) => [id, { id, seed: i + 1, points: 0, wins: 0, losses: 0, byes: 0, buchholz: 0, sonnebornBerger: 0, position: 0 }]));
  const opps = new Map<string, string[]>(seedOrder.map((id) => [id, []]));
  const beat = new Map<string, string[]>(seedOrder.map((id) => [id, []]));
  for (const g of games) {
    if (g.a && !g.b) { const r = rows.get(g.a); if (r) { r.points++; r.wins++; r.byes++; } continue; }
    if (!g.a || !g.b || !g.winner) continue;
    const loser = g.winner === g.a ? g.b : g.winner === g.b ? g.a : null;
    if (!loser) continue;
    opps.get(g.a)?.push(g.b); opps.get(g.b)?.push(g.a);
    const w = rows.get(g.winner); if (w) { w.points++; w.wins++; beat.get(g.winner)!.push(loser); }
    const l = rows.get(loser); if (l) l.losses++;
  }
  const pts = (id: string) => rows.get(id)?.points ?? 0;
  rows.forEach((r) => {
    r.buchholz = (opps.get(r.id) ?? []).reduce((s, o) => s + pts(o), 0);
    r.sonnebornBerger = (beat.get(r.id) ?? []).reduce((s, o) => s + pts(o), 0);
  });
  const order = resolveSwissTieBreaks(tieBreaks);
  const val = (r: SwissRow, k: SwissTieBreak) => (k === "buchholz" ? r.buchholz : k === "sonneborn_berger" ? r.sonnebornBerger : -(seed.get(r.id) ?? 0));
  const out = [...rows.values()].sort((x, y) => y.points - x.points || order.reduce((acc, k) => acc || val(y, k) - val(x, k), 0));
  out.forEach((r, i) => { r.position = i + 1; });
  return out;
}
