/**
 * One ranking engine for pool / round-robin finishing positions — used by the standings table AND by
 * play-off qualification/seeding, so the two can never disagree.
 *
 * Wins always rank first. Units level on wins are separated by the configured criteria in order; each
 * time a level group splits, the smaller groups restart from the first criterion (so head-to-head is
 * recalculated among only the players still level). Whatever is still level after every criterion is
 * ordered by the organiser's saved manual order, else reported as an unresolved tie.
 *
 * Criteria only use data SquashHub actually records on each game (`game_scores.sets`, or a
 * per-game score string "11-5, 9-11"). A criterion whose data is missing for any game of the tied
 * units is skipped for that group — never guessed.
 */
export type TieBreakCriterion = "game_difference" | "games_won" | "points_difference" | "head_to_head";

export const TIE_BREAK_CRITERIA: TieBreakCriterion[] = ["game_difference", "games_won", "points_difference", "head_to_head"];
/** Safe default for every tournament without a saved rule (incl. tournaments created before this setting). */
export const DEFAULT_TIE_BREAKS: TieBreakCriterion[] = ["game_difference", "games_won", "points_difference", "head_to_head"];

export const TIE_BREAK_TEXT: Record<TieBreakCriterion, string> = {
  game_difference: "Game difference",
  games_won: "Games won",
  points_difference: "Points difference",
  head_to_head: "Head-to-head",
};

export function normaliseTieBreaks(v: unknown): TieBreakCriterion[] {
  if (!Array.isArray(v)) return [...DEFAULT_TIE_BREAKS];
  const out = v.filter((x): x is TieBreakCriterion => TIE_BREAK_CRITERIA.includes(x as TieBreakCriterion));
  return [...new Set(out)];
}

/** "Wins → Game difference → … → Manual decision" */
export const tieBreakSequenceText = (c: TieBreakCriterion[]) => ["Wins", ...c.map((x) => TIE_BREAK_TEXT[x]), "Manual decision"].join(" → ");

export interface RankGame { a: string; b: string; winner: string | null; sets: Array<{ a: number; b: number }> | null; pointsKnown: boolean }

export interface UnitStats { id: string; played: number; wins: number; gamesWon: number; gamesLost: number; pointsFor: number; pointsAgainst: number; gamesKnown: boolean; pointsKnown: boolean }

export interface TieGroup {
  /** Unit ids still level, in the deterministic display order. */
  ids: string[];
  /** 1-based finishing positions the group occupies. */
  from: number;
  to: number;
}

export interface RankResult {
  order: string[];
  stats: Map<string, UnitStats>;
  /** Level after every automatic criterion and not covered by a manual order. */
  ties: TieGroup[];
  /** Positions decided by the organiser's manual order. */
  manual: TieGroup[];
}

/** Per-game scores from a stored match row; null when the row has no per-game detail. */
export function gameSetsOf(m: Record<string, any>): { sets: Array<{ a: number; b: number }> | null; pointsKnown: boolean } {
  const raw = m.game_scores?.sets;
  if (Array.isArray(raw) && raw.length) {
    const sets = raw.map((s: any) => ({ a: Number(s?.a), b: Number(s?.b) })).filter((s) => Number.isFinite(s.a) && Number.isFinite(s.b));
    if (sets.length) return { sets, pointsKnown: true };
  }
  const score = typeof m.score === "string" ? m.score.trim() : "";
  if (!score) return { sets: null, pointsKnown: false };
  const parts = score.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  const parsed = parts.map((p) => /^(\d+)\s*[-–:]\s*(\d+)$/.exec(p)).filter(Boolean) as RegExpExecArray[];
  if (parsed.length !== parts.length || !parsed.length) return { sets: null, pointsKnown: false };
  if (parsed.length === 1) {
    const [x, y] = [Number(parsed[0][1]), Number(parsed[0][2])];
    // "3-1" is a games count, not points: expand into games without point detail.
    if (Math.max(x, y) <= 5) return { sets: [...Array(x).fill({ a: 1, b: 0 }), ...Array(y).fill({ a: 0, b: 1 })], pointsKnown: false };
  }
  return { sets: parsed.map((r) => ({ a: Number(r[1]), b: Number(r[2]) })), pointsKnown: true };
}

/** Stats for each unit from decided games between units of this pool. */
export function unitStats(units: string[], games: RankGame[]): Map<string, UnitStats> {
  const s = new Map<string, UnitStats>(units.map((id) => [id, { id, played: 0, wins: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0, gamesKnown: true, pointsKnown: true }]));
  for (const g of games) {
    const A = s.get(g.a), B = s.get(g.b);
    if (!A || !B || !g.winner) continue;
    A.played++; B.played++;
    if (g.winner === g.a) A.wins++; else if (g.winner === g.b) B.wins++;
    if (!g.sets) { A.gamesKnown = B.gamesKnown = false; A.pointsKnown = B.pointsKnown = false; continue; }
    for (const x of g.sets) {
      if (x.a > x.b) { A.gamesWon++; B.gamesLost++; } else if (x.b > x.a) { B.gamesWon++; A.gamesLost++; }
      A.pointsFor += x.a; A.pointsAgainst += x.b; B.pointsFor += x.b; B.pointsAgainst += x.a;
    }
    if (!g.pointsKnown) A.pointsKnown = B.pointsKnown = false;
  }
  return s;
}

function criterionValues(c: TieBreakCriterion, group: string[], stats: Map<string, UnitStats>, games: RankGame[]): Map<string, number> | null {
  const st = group.map((id) => stats.get(id)!);
  if (c === "game_difference" || c === "games_won") {
    if (st.some((x) => !x.gamesKnown)) return null;
    return new Map(st.map((x) => [x.id, c === "games_won" ? x.gamesWon : x.gamesWon - x.gamesLost]));
  }
  if (c === "points_difference") {
    if (st.some((x) => !x.pointsKnown)) return null;
    return new Map(st.map((x) => [x.id, x.pointsFor - x.pointsAgainst]));
  }
  // head_to_head: wins in games played only among the level units.
  const inGroup = new Set(group);
  const v = new Map(group.map((id) => [id, 0]));
  for (const g of games) if (g.winner && inGroup.has(g.a) && inGroup.has(g.b)) v.set(g.winner, (v.get(g.winner) ?? 0) + 1);
  return v;
}

/**
 * Rank one pool. `units` gives the deterministic fallback order (e.g. seed order); `manualOrder` is the
 * organiser's saved order and is consulted ONLY for units still level after every criterion.
 */
export function rankUnits(units: string[], games: RankGame[], criteria: TieBreakCriterion[] = DEFAULT_TIE_BREAKS, manualOrder: string[] = [], extraWins?: Map<string, number>): RankResult {
  const stats = unitStats(units, games);
  extraWins?.forEach((n, id) => { const x = stats.get(id); if (x) x.wins += n; });
  const base = new Map(units.map((id, i) => [id, i]));
  const ties: TieGroup[] = [];
  const manual: TieGroup[] = [];
  const out: string[] = [];

  const split = (group: string[], val: (id: string) => number): string[][] => {
    const sorted = [...group].sort((x, y) => val(y) - val(x) || base.get(x)! - base.get(y)!);
    const buckets: string[][] = [];
    for (const id of sorted) {
      const last = buckets[buckets.length - 1];
      if (last && val(last[0]) === val(id)) last.push(id); else buckets.push([id]);
    }
    return buckets;
  };

  const resolve = (group: string[]) => {
    if (group.length === 1) { out.push(group[0]); return; }
    for (const c of criteria) {
      const v = criterionValues(c, group, stats, games);
      if (!v) continue;
      const parts = split(group, (id) => v.get(id) ?? 0);
      if (parts.length > 1) { parts.forEach(resolve); return; }
    }
    const from = out.length + 1, to = out.length + group.length;
    if (group.every((id) => manualOrder.includes(id))) {
      const ordered = [...group].sort((x, y) => manualOrder.indexOf(x) - manualOrder.indexOf(y));
      manual.push({ ids: ordered, from, to });
      out.push(...ordered);
      return;
    }
    const ordered = [...group].sort((x, y) => base.get(x)! - base.get(y)!);
    ties.push({ ids: ordered, from, to });
    out.push(...ordered);
  };

  split(units, (id) => stats.get(id)!.wins).forEach(resolve);
  return { order: out, stats, ties, manual };
}

/**
 * Does an unresolved tie matter to the next stage? `used` holds the 1-based positions the next stage
 * reads (each feeds a different slot), or null = every position matters.
 * Material when any occupied position is used: across the qualification line, or inside it where the
 * exact position decides seeding/crossover. Ties wholly among unused positions never block.
 */
export const tieIsMaterial = (t: TieGroup, used: ((pos: number) => boolean) | null) => {
  if (!used) return true;
  for (let p = t.from; p <= t.to; p++) if (used(p)) return true;
  return false;
};

/** Organiser-facing reason for a tie that must be decided manually. */
export function tieMessage(poolName: string, t: TieGroup, criteria: TieBreakCriterion[], nextStage?: string) {
  const seq = ["Wins", ...criteria.map((c) => TIE_BREAK_TEXT[c])].join(" → ");
  return `${poolName}: positions ${t.from}${t.to > t.from + 1 ? `–${t.to}` : ` and ${t.to}`} are still tied after ${seq} — decide the order${nextStage ? ` (decides who plays ${nextStage})` : " before the next stage is formed"}.`;
}
