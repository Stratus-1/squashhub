/**
 * Standard seeded knockout bracket from ONE ranked list (e.g. final Swiss standings).
 * Game order is chosen so the next round can pair winners of games 1v2, 3v4 …:
 *   8 → 1v8, 4v5, 2v7, 3v6  (seeds 1 and 2 can only meet in the final).
 * Pure presentation/validation helpers — never decide how many qualify; the admin does.
 */
export const BRACKET_SIZES = [4, 8, 16] as const;

/** Seed order in bracket slots, e.g. 8 → [1,8,4,5,2,7,3,6]. */
export function seededOrder(size: number): number[] {
  if (size < 2 || (size & (size - 1)) !== 0) throw new Error("Bracket size must be a power of two.");
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/** One line per game in the explicit-matchup syntax, using finishing positions of the single source pool. */
export function seededBracketText(size: number): string {
  const o = seededOrder(size);
  const lines: string[] = [];
  for (let i = 0; i < o.length; i += 2) lines.push(`R1: A${o[i]} v A${o[i + 1]}`);
  return lines.join("\n");
}

/** Games a stage's NAME implies (Quarterfinal = 4, Semifinal = 2, Final = 1); null when the name says nothing. */
export function expectedGamesForStageName(name: string): number | null {
  const n = name.toLowerCase().replace(/[\s-]/g, "");
  if (n.includes("quarterfinal")) return 4;
  if (n.includes("semifinal")) return 2;
  if (/^(grand)?final$/.test(n)) return 1;
  return null;
}

/**
 * Checks a single-pool matchup list: each finishing position 1..N used exactly once, N within the
 * source field, and the game count matching the stage name (a "Quarterfinal" must not be a semifinal).
 */
export function seededLinesIssues(text: string, stageName: string, fieldSize: number): string[] {
  const out: string[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const pos: number[] = [];
  for (const l of lines) {
    const m = l.match(/A(\d+)\s*v\s*A(\d+)/i);
    if (!m) { out.push(`"${l}" is not a game between two finishing positions.`); continue; }
    pos.push(Number(m[1]), Number(m[2]));
  }
  if (!lines.length) out.push("Choose how many players qualify.");
  const n = pos.length;
  const seen = new Set<number>();
  for (const p of pos) { if (seen.has(p)) out.push(`Position ${p} is used more than once.`); seen.add(p); }
  for (let p = 1; p <= n; p++) if (!seen.has(p)) out.push(`Position ${p} is missing.`);
  if (fieldSize && n > fieldSize) out.push(`Only ${fieldSize} players finished the earlier stage; ${n} positions were used.`);
  const want = expectedGamesForStageName(stageName);
  if (want != null && lines.length && lines.length !== want) out.push(`${stageName} needs ${want} game${want > 1 ? "s" : ""} (top ${want * 2}); this list has ${lines.length}.`);
  return [...new Set(out)];
}
