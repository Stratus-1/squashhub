/**
 * Read-only Swiss progression model for the Riverside pilot view (`tournament_swiss_progression_view`).
 * Pure and display-only: it reads saved matches exactly as stored and never re-pairs, re-scores or
 * rewrites anything. Existing Swiss stages ("results-based" pairing, incl. position_swap ranking) are
 * replayed with the SAME `swissTable` the live standings use, so old results are never reinterpreted.
 * The new positional format (Phase 1 templates) is only labelled here; it is not active anywhere.
 */
import { swissTable, type SwissGame } from "@/lib/tournaments/swiss-standings";
import { categoryTemplate, planCategory, validateTemplate } from "@/lib/tournaments/swiss-positional";

export type SwissFormatKind = "results_based" | "positional";
export const SWISS_FORMAT_LABEL: Record<SwissFormatKind, string> = {
  results_based: "Existing Swiss (score-based, live engine) — each round paired by current score. Not fixed-position Swiss.",
  positional: "Fixed-position Swiss — winner takes the better slot (new format, not active yet)",
};

export interface ProgressionMatchInput {
  id: string;
  a: string | null; b: string | null;
  winner: string | null;
  round: number;
  isBye?: boolean;
  status?: string | null;
  score?: string | null;
  date?: string | null; time?: string | null; court?: string | null; playBy?: string | null;
  placeholderA?: string | null; placeholderB?: string | null;
}

export type FixtureState = "completed" | "scheduled" | "awaiting_opponent" | "bye";
export interface ProgressionFixture {
  id: string; round: number; state: FixtureState;
  a: string | null; b: string | null; aLabel: string; bLabel: string;
  winner: string | null; loser: string | null; score: string | null;
  when: string | null; court: string | null; playBy: string | null;
}
export interface ProgressionRound { round: number; created: boolean; fixtures: ProgressionFixture[]; complete: boolean }
export interface ProgressionRow {
  id: string; name: string; seed: number;
  /** Position after each round (index 0 = after round 1); null when that round has no results yet. */
  positions: (number | null)[];
  /** Per round: "W v Name", "L v Name", "Bye", "v Name" (not played yet) or "TBD". */
  cells: string[];
  wins: number; current: number;
}
export interface SwissProgressionModel {
  format: SwissFormatKind; totalRounds: number; rounds: ProgressionRound[]; rows: ProgressionRow[];
}

const UNRESOLVED = "To be decided";

export function buildSwissProgression(input: {
  seedOrder: string[]; names: Record<string, string>; matches: ProgressionMatchInput[];
  totalRounds?: number | null; tieBreaks?: readonly string[] | null; format?: SwissFormatKind;
}): SwissProgressionModel {
  const { seedOrder, names, matches, tieBreaks } = input;
  const nm = (id: string | null, ph?: string | null) => (id ? names[id] ?? "Unknown player" : ph || UNRESOLVED);
  const lastCreated = Math.max(0, ...matches.map((m) => m.round || 0));
  const totalRounds = Math.max(lastCreated, input.totalRounds ?? 0);

  const rounds: ProgressionRound[] = [];
  for (let r = 1; r <= totalRounds; r++) {
    const ms = matches.filter((m) => m.round === r);
    const fixtures = ms.map((m): ProgressionFixture => {
      const bye = !!m.isBye || (!!m.a !== !!m.b && m.status === "completed");
      const done = !bye && m.status === "completed" && !!m.winner;
      const state: FixtureState = bye ? "bye" : done ? "completed" : !m.a || !m.b ? "awaiting_opponent" : "scheduled";
      const loser = done ? (m.winner === m.a ? m.b : m.a) : null;
      return {
        id: m.id, round: r, state, a: m.a, b: bye ? null : m.b,
        aLabel: nm(m.a, m.placeholderA), bLabel: bye ? "Bye" : nm(m.b, m.placeholderB),
        winner: done ? m.winner : bye ? m.a ?? m.b : null, loser, score: m.score ?? null,
        when: m.date ? `${m.date}${m.time ? ` ${m.time.slice(0, 5)}` : ""}` : null,
        court: m.court ?? null, playBy: m.playBy ?? null,
      };
    });
    rounds.push({ round: r, created: ms.length > 0, fixtures, complete: ms.length > 0 && fixtures.every((f) => f.state === "completed" || f.state === "bye") });
  }

  const ids = [...seedOrder, ...new Set(matches.flatMap((m) => [m.a, m.b]).filter((x): x is string => !!x && !seedOrder.includes(x)))];
  const gamesUpTo = (r: number): SwissGame[] => matches.filter((m) => m.round <= r).flatMap((m) => {
    if (m.isBye || (!m.a !== !m.b)) return m.a || m.b ? [{ a: (m.a ?? m.b)!, b: null, winner: null, round: m.round }] : [];
    if (!m.a || !m.b || m.status !== "completed" || !m.winner) return [];
    return [{ a: m.a, b: m.b, winner: m.winner, round: m.round }];
  });
  const posAfter: (Map<string, number> | null)[] = rounds.map((rd) => {
    if (!rd.fixtures.some((f) => f.state === "completed" || f.state === "bye")) return null;
    return new Map(swissTable(ids, gamesUpTo(rd.round), tieBreaks).map((t) => [t.id, t.position]));
  });
  const finalTable = swissTable(ids, gamesUpTo(totalRounds), tieBreaks);
  const cur = new Map(finalTable.map((t) => [t.id, t]));

  const rows: ProgressionRow[] = ids.map((id, i) => ({
    id, name: names[id] ?? "Unknown player", seed: i + 1,
    positions: posAfter.map((p) => p?.get(id) ?? null),
    cells: rounds.map((rd) => {
      const f = rd.fixtures.find((x) => x.a === id || x.b === id);
      if (!f) return rd.created ? "—" : "TBD";
      if (f.state === "bye") return "Bye";
      const opp = f.a === id ? f.bLabel : f.aLabel;
      if (f.state === "completed") return `${f.winner === id ? "W" : "L"} v ${opp}`;
      return f.state === "awaiting_opponent" ? `v ${UNRESOLVED}` : `v ${opp}`;
    }),
    wins: cur.get(id)?.wins ?? 0, current: cur.get(id)?.position ?? i + 1,
  })).sort((x, y) => x.current - y.current);

  return { format: input.format ?? "results_based", totalRounds, rounds, rows };
}

/** Movement between the two latest rounds with results: positive = moved up. */
export function movement(row: ProgressionRow): number | null {
  const known = row.positions.filter((p): p is number => p != null);
  if (known.length < 2) return null;
  return known[known.length - 2] - known[known.length - 1];
}

/* ---------- Positional grid (read-only display of saved matches) ---------- */
export interface GridRow { pos: number | null; id: string | null; name: string; when: string | null; result: string }
export interface GridBlock { matchId: string; rows: [GridRow, GridRow]; score: string | null; court: string | null; playBy: string | null }
export interface GridRound { round: number; created: boolean; blocks: GridBlock[] }

/**
 * Lays saved matches out as side-by-side round columns of 2-row blocks.
 * Position numbers: round 1 = seed; later rounds = the position each player held after the previous
 * round, as calculated by the SAME standings the live page uses. For the existing score-based Swiss this
 * is a display aid only — players were NOT moved into fixed slots, and nothing here re-pairs anyone.
 */
export function buildSwissGrid(model: SwissProgressionModel): GridRound[] {
  const byId = new Map(model.rows.map((r) => [r.id, r]));
  const posEntering = (id: string | null, round: number): number | null => {
    if (!id) return null;
    const row = byId.get(id);
    if (!row) return null;
    return round === 1 ? row.seed : row.positions[round - 2] ?? null;
  };
  return model.rounds.map((rd) => {
    const blocks = rd.fixtures.map((f): GridBlock => {
      const res = (id: string | null) =>
        f.state === "bye" ? (id ? "Bye" : "") :
        f.state === "completed" && id ? (f.winner === id ? "W" : "L") : "";
      const when = f.when ?? (f.playBy ? `Play by ${f.playBy}` : null);
      const a: GridRow = { pos: posEntering(f.a, rd.round), id: f.a, name: f.aLabel, when, result: res(f.a) };
      const b: GridRow = { pos: f.state === "bye" ? null : posEntering(f.b, rd.round), id: f.b, name: f.state === "bye" ? "Bye" : f.bLabel, when, result: res(f.b) };
      const pair: [GridRow, GridRow] = b.pos != null && (a.pos == null || b.pos < a.pos) ? [b, a] : [a, b];
      return { matchId: f.id, rows: pair, score: f.score, court: f.court, playBy: f.playBy };
    }).sort((x, y) => (x.rows[0].pos ?? 999) - (y.rows[0].pos ?? 999));
    return { round: rd.round, created: rd.created, blocks };
  });
}

/** Proposed base slots only. Legacy results never resolve future proposed occupants.
 * Saved Round 1 is copied factually, not forced into a template.
 * Occupant-aware bye/rematch adjustments require separately approved engine integration.
 */
export function buildProposedSwissGrid(model: SwissProgressionModel): { rounds: GridRound[]; issues: string[] } {
  const n = model.rows.length;
  const plan = planCategory(n, model.totalRounds);
  if (plan.issues.length) return { rounds: [], issues: plan.issues };
  const template = categoryTemplate(n, model.totalRounds);
  const issues = validateTemplate(n, template);
  if (issues.length) return { rounds: [], issues };
  const savedFirst = buildSwissGrid(model).find((r) => r.round === 1);
  const pending = (pos: number | null, bye = false): GridRow => ({ pos, id: null, name: bye ? "Bye" : "TBD", when: null, result: "" });
  return { issues: [], rounds: template.map((rd): GridRound => {
    if (rd.round === 1 && savedFirst?.created) return savedFirst;
    const blocks: GridBlock[] = rd.pairs.map((p) => ({
      matchId: `proposed-${rd.round}-${p.a}-${p.b}`, rows: [pending(p.a), pending(p.b)], score: null, court: null, playBy: null,
    }));
    if (rd.bye != null) blocks.push({ matchId: `proposed-${rd.round}-bye`, rows: [pending(rd.bye), pending(null, true)], score: null, court: null, playBy: null });
    return { round: rd.round, created: false, blocks };
  }) };
}
