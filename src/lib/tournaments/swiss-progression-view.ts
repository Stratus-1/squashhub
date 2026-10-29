/**
 * Read-only Swiss progression model for the Riverside pilot view (`tournament_swiss_progression_view`).
 * Pure and display-only: it reads saved matches exactly as stored and never re-pairs, re-scores or
 * rewrites anything. Existing Swiss stages ("results-based" pairing, incl. position_swap ranking) are
 * replayed with the SAME `swissTable` the live standings use, so old results are never reinterpreted.
 * The new positional format (Phase 1 templates) is only labelled here; it is not active anywhere.
 */
import { swissTable, isPositionSwap, type SwissGame } from "@/lib/tournaments/swiss-standings";
import { fixtureKey, type FixtureSchedule } from "@/lib/tournaments/swiss-positional-draw";
import { categoryTemplate, planCategory, validateTemplate } from "@/lib/tournaments/swiss-positional";
import { strictSwissPlan, preferredSwissTemplate, swissStrictFromRound, swissHalves } from "./swiss-no-repeat";

import { swissPreviewFinalsTemplate } from "./swiss-preview-finals";
import { uitsigMensCChart } from "./swiss-uitsig-mens-c-chart";
import { uitsigLadiesAChart } from "./swiss-uitsig-ladies-a-chart";
import { sixteenPlayerChart } from "./swiss-riverside-aabb-charts";
import { hybridSwissTable, rrFinishOn, rrFinishRound, rrFinishRepeats, TEN_REMAINDER_CHART, tenRemainderSlots, usesTenRemainderChart, type RrFinish } from "./swiss-rr-finish";
import { swissRound } from "./contract";
import { hasSwissMatchActivity } from "./swiss-rr-display";
import { sequenceSwissRound, swissOpponentKey } from "./swiss-sequencing";
import { settledSwiss } from "./swiss-settled";
import { swissSequencingEnabled, type SwissSequencingPolicy } from "./swiss-sequencing-policy";
import { pendingSwissSlots } from "./swiss-pending-slots";

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
  sideAPoints?: number | null; sideBPoints?: number | null; gameScores?: any; forfeitMemberId?: string | null;
  date?: string | null; time?: string | null; court?: string | null; playBy?: string | null;
  placeholderA?: string | null; placeholderB?: string | null;
}

export type FixtureState = "completed" | "scheduled" | "awaiting_opponent" | "bye";
export interface ProgressionFixture {
  started?: boolean;
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
  /** Position from the Swiss stage's own rounds only (1..configuredRounds); null when those rounds aren't all complete. */
  swissFinalPosition?: number | null;
}
export interface SwissProgressionModel {
  swissSequencing?: SwissSequencingPolicy;
  tournamentId?: string;
  rrFinish?: RrFinish | null;
  tieBreaks?: readonly string[] | null;
  format: SwissFormatKind; totalRounds: number; rounds: ProgressionRound[]; rows: ProgressionRow[];
  /** Configured Swiss round count (excludes later follow-up stage games that share the round axis). */
  configuredRounds: number;
  /** True when every Swiss-stage round (1..configuredRounds) is complete. */
  swissStageComplete: boolean;
}

const UNRESOLVED = "To be decided";

export function buildSwissProgression(input: {
  seedOrder: string[]; names: Record<string, string>; matches: ProgressionMatchInput[];
  totalRounds?: number | null; tieBreaks?: readonly string[] | null; format?: SwissFormatKind;
  rrFinish?: RrFinish | null;
  swissSequencing?: SwissSequencingPolicy;
  tournamentId?: string;
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
        id: m.id, round: r, state, started: hasSwissMatchActivity(m), a: m.a, b: bye ? null : m.b,
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
    return new Map(hybridSwissTable(ids, gamesUpTo(rd.round), input.rrFinish, tieBreaks).map((t) => [t.id, t.position]));
  });
  const finalTable = hybridSwissTable(ids, gamesUpTo(totalRounds), input.rrFinish, tieBreaks);
  const cur = new Map(finalTable.map((t) => [t.id, t]));
  // Swiss-stage-only final standing: configured rounds, ignoring follow-up stage games that share the round axis.
  const configuredRounds = Math.min(input.totalRounds ?? totalRounds, totalRounds);
  const swissRounds = rounds.filter((rd) => rd.round <= configuredRounds);
  const swissStageComplete = swissRounds.length > 0 && swissRounds.every((rd) => rd.complete);
  const swissFinal = new Map(hybridSwissTable(ids, gamesUpTo(configuredRounds), input.rrFinish, tieBreaks).map((t) => [t.id, t.position]));

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
    swissFinalPosition: swissStageComplete ? swissFinal.get(id) ?? null : null,
  })).sort((x, y) => x.current - y.current);

  return { format: input.format ?? "results_based", totalRounds, configuredRounds, swissStageComplete, rounds, rows, tieBreaks, rrFinish: input.rrFinish, ...(input.swissSequencing ? { swissSequencing: input.swissSequencing, tournamentId: input.tournamentId } : {}) };
}

/** Movement between the two latest rounds with results: positive = moved up. */
export function movement(row: ProgressionRow): number | null {
  const known = row.positions.filter((p): p is number => p != null);
  if (known.length < 2) return null;
  return known[known.length - 2] - known[known.length - 1];
}

/* ---------- Positional grid (read-only display of saved matches) ---------- */
export interface GridRow { pos: number | null; id: string | null; name: string; when: string | null; result: string; projected?: boolean }

/** Match summary in games won, winner first ("3–1"). Accepts "3-11, 11-5, 11-4, 11-5"; passes through an existing "3-1". */
export function gamesWonSummary(score: string | null | undefined): string | null {
  if (!score) return null;
  const sets = [...score.matchAll(/(\d+)\s*[-–]\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  if (!sets.length) return null;
  if (sets.length === 1 && Math.max(...sets[0]) <= 5) return `${Math.max(...sets[0])}–${Math.min(...sets[0])}`;
  let a = 0, b = 0; for (const [x, y] of sets) { if (x > y) a++; else if (y > x) b++; }
  return `${Math.max(a, b)}–${Math.min(a, b)}`;
}
export interface GridBlock { matchId: string; rows: [GridRow, GridRow]; score: string | null; court: string | null; playBy: string | null; saved?: boolean; scheduleKey?: string; /** Pairing proven identical under every outcome of the outstanding games — the only blocks the partial-generation writer may create early. */ certified?: boolean }
export interface GridRound { round: number; created: boolean; blocks: GridBlock[]; schedule?: ProposedRoundSchedule }

/** Round-level schedule for a PROPOSED round. Never a per-match booking. */
export type ProposedRoundSchedule =
  | { kind: "play_by"; label: string }
  | { kind: "window"; label: string }
  | { kind: "none"; label: string };

export interface StageScheduleConfig {
  rule?: string | null; date?: string | null; deadline?: string | null;
  roundDates?: (string | null)[] | null; timeFrom?: string | null; timeTo?: string | null; courtIds?: (number | string)[] | null;
}

const fmtDay = (d: string) => {
  const dt = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return d.slice(0, 10);
  const W = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${W[dt.getUTCDay()]} ${dt.getUTCDate()} ${M[dt.getUTCMonth()]}`;
};

/** What the configured stage schedule says about ONE round. Read-only; reports only what is saved. */
export function proposedRoundSchedule(cfg: StageScheduleConfig | null | undefined, round: number, courtName?: (id: number | string) => string): ProposedRoundSchedule {
  if (!cfg) return { kind: "none", label: "Not scheduled" };
  const day = cfg.roundDates?.[round - 1] ?? null;
  if (cfg.rule === "play_by") {
    const by = day ?? cfg.deadline ?? null;
    return by ? { kind: "play_by", label: `Play by ${fmtDay(by)}` } : { kind: "none", label: "Not scheduled" };
  }
  if (!day) return { kind: "none", label: "Not scheduled" };
  const time = cfg.timeFrom || cfg.timeTo ? ` ${String(cfg.timeFrom ?? "").slice(0, 5)}–${String(cfg.timeTo ?? "").slice(0, 5)}` : "";
  const courts = cfg.courtIds?.length ? ` · ${cfg.courtIds.map((c) => courtName?.(c) ?? `Court ${c}`).join(", ")}` : "";
  return { kind: "window", label: `Round window: ${fmtDay(day)}${time}${courts}` };
}

/**
 * Lays saved matches out as side-by-side round columns of 2-row blocks.
 * Position numbers: round 1 = seed; later rounds = the position each player held after the previous
 * round, as calculated by the SAME standings the live page uses. For the existing score-based Swiss this
 * is a display aid only — players were NOT moved into fixed slots, and nothing here re-pairs anyone.
 */
export function buildSwissGrid(model: SwissProgressionModel): GridRound[] {
  const byId = new Map(model.rows.map((r) => [r.id, r]));
  const seeds = [...model.rows].sort((a, b) => a.seed - b.seed).map((r) => r.id);
  const locked = rrFinishOn(model.rrFinish) && !!model.rounds.find((r) => r.round === 2)?.complete;
  const hybridPositions = new Map(model.rounds.filter((r) => r.round >= 3).map((rd) => {
    const games = model.rounds.filter((r) => r.round < rd.round).flatMap((r) => r.fixtures.filter((f) => f.state === "completed" || f.state === "bye").map((f) => ({ a: f.a, b: f.b, winner: f.winner, round: r.round })));
    return [rd.round, new Map(hybridSwissTable(seeds, games, model.rrFinish, model.tieBreaks).map((r) => [r.id, r.position]))];
  }));
  const posEntering = (id: string | null, round: number): number | null => {
    if (!id) return null;
    const row = byId.get(id);
    if (!row) return null;
    if (locked && round >= 3) return hybridPositions.get(round)?.get(id) ?? null;
    return round === 1 ? row.seed : row.positions[round - 2] ?? null;
  };
  return model.rounds.map((rd) => {
    const blocks = rd.fixtures.map((f): GridBlock => {
      const res = (id: string | null) =>
        f.state === "bye" ? (id ? "Bye" : "") :
        f.state === "completed" && id ? (f.winner === id ? "W" : "L") : "";
      const when = f.when ? (f.playBy && f.state !== "completed" ? `${f.when} · Play by ${f.playBy}` : f.when) : (f.playBy ? `Play by ${f.playBy}` : null);
      const a: GridRow = { pos: posEntering(f.a, rd.round), id: f.a, name: f.aLabel, when, result: res(f.a) };
      const b: GridRow = { pos: f.state === "bye" ? null : posEntering(f.b, rd.round), id: f.b, name: f.state === "bye" ? "Bye" : f.bLabel, when, result: res(f.b) };
      const pair: [GridRow, GridRow] = b.pos != null && (a.pos == null || b.pos < a.pos) ? [b, a] : [a, b];
      return { matchId: f.id, rows: pair, score: gamesWonSummary(f.score), court: f.court, playBy: f.playBy };
    }).sort((x, y) => (x.rows[0].pos ?? 999) - (y.rows[0].pos ?? 999));
    return { round: rd.round, created: rd.created, blocks };
  });
}

/** Proposed slots. Saved completed results whose players match a template pair project names forward (read-only).
 * Saved Round 1 is copied factually, not forced into a template.
 * The opt-in no-repeat resolver preserves saved games and changes unsaved pairings from round 3 only.
 */
export function buildProposedSwissGrid(model: SwissProgressionModel, opts: { finalSwissAdjacencyPreview?: boolean; factualOpeningRounds?: boolean; exactMensCChart?: boolean; mensCRemainderChart?: boolean; exactLadiesAChart?: boolean; exactSixteenChart?: boolean; previewFinals?: boolean; noRepeats?: boolean; schedule?: StageScheduleConfig | null; courtName?: (id: number | string) => string; slots?: Record<string, FixtureSchedule>; appliedPlayBy?: Record<number, string>; /** Writer-only (server): keep ids on certified settled pairings so they can become fixtures; the display never passes this. */ partialGeneration?: boolean } = {}): { rounds: GridRound[]; issues: string[]; warnings?: string[] } {
  const sequencing = swissSequencingEnabled(model.swissSequencing, model.tournamentId);
  if (rrFinishOn(model.rrFinish) && model.configuredRounds === 5 && !(opts.exactLadiesAChart && model.rows.length === 9 && model.totalRounds === 5)) {
    const normal = buildProposedSwissGrid({ ...model, rrFinish: undefined, ...(sequencing ? { swissSequencing: undefined } : {}) }, opts);
    const saved = buildSwissGrid(model);
    const locked = !!model.rounds.find((r) => r.round === 2)?.complete;
    // Before Round 2 is complete the groups are previewed from the current standing (provisional);
    // they never fall back to plain Swiss/chart pairings, which would cross group boundaries.
    const snapshot = locked
      ? [...model.rows].sort((a, b) => (a.positions[1] ?? 0) - (b.positions[1] ?? 0)).map((r) => r.id)
      : [...model.rows].sort((a, b) => (a.current ?? 0) - (b.current ?? 0)).map((r) => r.id);
    const byId = new Map(model.rows.map((r) => [r.id, r]));
    const history = model.rounds.flatMap((r) => r.fixtures.map((f) => ({ a: f.a, b: f.b, winner: f.winner, round: r.round, state: f.state })));
    // The owner-approved 18-player chart accepts its intentional repeats; never hold its rounds for them.
    const approvedChart = (opts.exactMensCChart === true || opts.mensCRemainderChart === true) && model.rows.length === 18 && model.rrFinish?.groups === 3;
    const conflicts = locked && !approvedChart && !usesTenRemainderChart(model.rrFinish, snapshot.length - (model.rrFinish.groups ?? 0) * 4) ? rrFinishRepeats(snapshot, model.rrFinish.groups, history.filter((f) => f.round <= 2 && f.a && f.b).map((f) => [f.a as string, f.b])) : [];
    const issues: string[] = conflicts.length ? ["The fixed round-robin groups would repeat qualifying opponents; confirm a different grouping before generating Round 3."] : [];
    const warnings: string[] = [];
    // While Round 2 is undecided the previewed group/remainder positions are only provisional:
    // show a name ONLY where the position is identical under every outcome of the outstanding
    // games (Buchholz/SB move with opponents' points). Everything else stays an open slot.
    const openR2 = !locked ? model.rounds.filter((r) => r.round <= 2 && r.created && !r.complete).sort((a, b) => a.round - b.round)[0] ?? null : null;
    const unsettled = openR2 ? (() => {
      const outstanding = openR2.fixtures.filter((f) => f.state === "scheduled" && f.a && f.b).map((f) => ({ a: f.a as string, b: f.b as string }));
      if (!outstanding.length) return null;
      const decidedGames = model.rounds.filter((r) => r.round <= openR2.round).flatMap((r) => r.fixtures.flatMap((f) =>
        f.state === "completed" ? [{ a: f.a, b: f.b, winner: f.winner, round: r.round }]
        : f.state === "bye" ? [{ a: f.a ?? f.b, b: null, winner: null, round: r.round }] : []));
      const res = settledSwiss({
        seedOrder: [...model.rows].sort((a, b) => a.seed - b.seed).map((r) => r.id),
        decidedGames, outstanding, round: openR2.round + 1, finalRound: model.configuredRounds,
        tieBreaks: model.tieBreaks, positionsOnly: true,
      });
      return res.enumerable ? res.settledPositions : new Map<string, number>();
    })() : null;
    // Partial generation (writer only): a group slot is fixed once its occupant's position is
    // provably final under every outcome of the outstanding games AND the provisional standing
    // already shows them there. A block is certified when BOTH of its slots are fixed — the group
    // schedule then pairs the same two players in every scenario, even while other slots in the
    // same group of four are still open. Remainder positions stay uncertified: Swiss pairings
    // there are not determined by positions alone.
    const certifiedPos = new Set<number>();
    if (opts.partialGeneration && unsettled) {
      const groupSlots = (model.rrFinish?.groups ?? 0) * 4;
      const provisional = new Map(snapshot.map((id, i) => [id, i + 1]));
      for (const [id, finalRank] of unsettled) {
        const p = provisional.get(id);
        if (p != null && p === finalRank && p <= groupSlots) certifiedPos.add(p);
      }
    }
    return { issues, ...(sequencing || opts.finalSwissAdjacencyPreview ? { warnings } : {}), rounds: saved.map((rd) => {
      if (rd.round < 3) return opts.factualOpeningRounds && rd.created ? { ...rd, blocks: rd.blocks.map((b) => ({ ...b, saved: true })) } : normal.rounds.find((r) => r.round === rd.round) ?? rd;
      const plan = rrFinishRound(snapshot, rd.round, model.rrFinish?.groups ?? 0);
      const fixed = new Map(snapshot.map((id, i) => [id, i + 1]));
      const groupIds = new Set(plan.pairs.flat());
      const factual = rd.blocks.map((b) => ({ ...b, saved: true, rows: b.rows.map((r) => ({ ...r, pos: r.id && groupIds.has(r.id) ? fixed.get(r.id) ?? r.pos : r.pos })).sort((a,b) => (a.pos ?? 999) - (b.pos ?? 999)) as [GridRow, GridRow] }));
      const covered = new Set(factual.flatMap((b) => b.rows.map((r) => r.id)));
      const schedule = opts.appliedPlayBy?.[rd.round] ? { label: `Play by ${fmtDay(opts.appliedPlayBy[rd.round])}` } : proposedRoundSchedule(opts.schedule, rd.round, opts.courtName);
      let pairs: Array<[string, string | null]> = plan.pairs;
      const tenChart = usesTenRemainderChart(model.rrFinish, plan.remainder.length);
      const chartRest = tenChart || ((opts.exactMensCChart === true || opts.mensCRemainderChart === true) && model.rows.length === 18 && model.rrFinish?.groups === 3);
      const prevDone = !!model.rounds.find((r) => r.round === rd.round - 1)?.complete;
      // Owner's 18-player chart: positions 13–18 follow the chart (13v17,14v18,15v16 / 13v15,14v17,16v18 / 13v14,15v16,17v18),
      // with positions taken from standings after the previous round. Names appear only once that round is complete.
      const chartBlocks: GridBlock[] = [];
      if (chartRest && !tenChart) {
        // Fixed-position chart: winner takes the better slot of its pair, loser the worse slot (no points re-ranking).
        // A slot shows a name as soon as the game that decides it is complete.
        const chart = uitsigMensCChart();
        let slots: Array<string | null> = [...model.rows].sort((a, b) => a.seed - b.seed).map((r) => r.id);
        for (let r = 1; r < rd.round; r++) {
          const nextSlots: Array<string | null> = Array(slots.length).fill(null);
          for (const cp of chart[r - 1]?.pairs ?? []) {
            const x0 = slots[cp.a - 1], y0 = slots[cp.b - 1];
            const g = x0 && y0 ? history.find((f) => f.round === r && f.state === "completed" && f.winner && ((f.a === x0 && f.b === y0) || (f.a === y0 && f.b === x0))) : undefined;
            if (g) { nextSlots[cp.a - 1] = g.winner as string; nextSlots[cp.b - 1] = g.winner === x0 ? y0 : x0; }
          }
          slots = nextSlots;
        }
        void prevDone;
        for (const p of chart[rd.round - 1].pairs.filter((p) => p.a > 12)) {
          const x = slots[p.a - 1] ?? null, y = slots[p.b - 1] ?? null;
          if ((x && covered.has(x)) || (y && covered.has(y))) continue;
          const row = (id: string | null, pos: number): GridRow => id ? { id, pos, name: byId.get(id)?.name ?? "Unknown player", result: "", projected: true, when: schedule.label } : { id: null, pos, name: "TBD", result: "", when: schedule.label };
          chartBlocks.push({ matchId: `chart-${rd.round}-${p.a}-${p.b}`, rows: [row(x, p.a), row(y, p.b)], score: null, court: null, playBy: opts.appliedPlayBy?.[rd.round] ?? null });
        }
      } else if (tenChart) {
        // Approved 10-player remainder chart: names appear once the game deciding each slot is complete.
        const offset = plan.pairs.length * 2;
        // Before Round 2 is complete, a slot fills as soon as that player's own Round 2 game is decided
        // (fixed-position swap: loser takes the lower position immediately). Round 3 only.
        const r2Done = (id: string) => history.some((f) => f.round === 2 && (f.state === "completed" || f.state === "bye") && (f.a === id || f.b === id));
        const slots = locked
          ? tenRemainderSlots(plan.remainder, rd.round, history)
          : rd.round === 3
            ? plan.remainder.map((id) => (id && r2Done(id) ? id : null))
            : Array(10).fill(null);
        for (const [a, b] of TEN_REMAINDER_CHART[rd.round] ?? []) {
          const x = slots[a - 1] ?? null, y = slots[b - 1] ?? null;
          if ((x && covered.has(x)) || (y && covered.has(y))) continue;
          const row = (id: string | null, pos: number): GridRow => id ? { id, pos, name: byId.get(id)?.name ?? "Unknown player", result: "", projected: true, when: schedule.label } : { id: null, pos, name: "TBD", result: "", projected: true, when: schedule.label };
          chartBlocks.push({ matchId: `chart10-${rd.round}-${a}-${b}`, rows: [row(x, offset + a), row(y, offset + b)], score: null, court: null, playBy: opts.appliedPlayBy?.[rd.round] ?? null });
        }
      } else if ((sequencing ? prevDone && locked : prevDone || (!locked && rd.round === 3)) && plan.remainder.length) {
        const rest = new Set(plan.remainder);
        const seeds = [...model.rows].sort((a, b) => a.seed - b.seed).map((r) => r.id);
        const table = hybridSwissTable(seeds, history.filter((f) => f.round < rd.round && (f.state === "completed" || f.state === "bye")), model.rrFinish, model.tieBreaks).filter((r) => rest.has(r.id));
        const positions = new Map(table.map((r, i) => [r.id, plan.pairs.length * 2 + i + 1]));
        const met = new Set(history.filter((f) => f.a && f.b).map((f) => [f.a, f.b].sort().join("|")));
        const usedRest = new Set(factual.flatMap((b) => b.rows.map((r) => r.id)));
        for (const [id, pos] of positions) fixed.set(id, pos);
        try {
          // A partially saved round is authoritative, not a request to fill missing games.
          if ((sequencing || (opts.finalSwissAdjacencyPreview && rd.round === model.configuredRounds)) && !usedRest.size) {
            const result = sequenceSwissRound({ players: table.map((r, i) => ({ ...r, points: isPositionSwap(model.tieBreaks) ? 0 : r.points, seed: i + 1 })), played: met, round: rd.round, finalRound: model.configuredRounds, positionOffset: plan.pairs.length * 2 });
            pairs = [...pairs, ...result.pairs]; warnings.push(...result.exceptions);
          } else if (!sequencing) pairs = [...pairs, ...swissRound(table.filter((r) => !usedRest.has(r.id)).map((r, i) => ({ id: r.id, points: r.points, seed: i + 1 })), met)];
        }
        catch { issues.push(`Round ${rd.round}: the Swiss remainder cannot be paired without repeat opponents.`); }
      }
      const pending = pairs.filter(([a, b]) => !covered.has(a) && !covered.has(b)).map(([a, b]) => ({
        matchId: `rr-proposed-${rd.round}-${a}-${b}`, rows: [a, b].map((id) => {
          const sure = !unsettled || (id != null && unsettled.has(id)) || (id != null && certifiedPos.has(fixed.get(id) ?? -1));
          return id && !sure
            ? { id: null, pos: fixed.get(id) ?? null, name: "TBD", result: "", projected: true, when: schedule.label }
            : { id, pos: id ? fixed.get(id) ?? null : null, name: id ? byId.get(id)?.name ?? "Unknown player" : "Bye", result: "", projected: true, when: schedule.label };
        }) as [GridRow, GridRow], score: null, court: null, playBy: opts.appliedPlayBy?.[rd.round] ?? null,
        ...(a != null && b != null && certifiedPos.has(fixed.get(a) ?? -1) && certifiedPos.has(fixed.get(b) ?? -1) ? { certified: true } : {}),
      }));
      // Future slots are paired position labels only, never decided player identities.
      const shown = new Set([...factual, ...pending, ...chartBlocks].flatMap((b) => b.rows.map((r) => r.pos)));
      const remainingPositions = plan.remainder.flatMap((id) => {
        const pos = fixed.get(id);
        return pos == null || shown.has(pos) ? [] : [pos];
      });
      // Always two numbered positions per game; never one row per position.
      const unresolved: GridBlock[] = chartRest ? [] : pendingSwissSlots(rd.round, remainingPositions, schedule.label, opts.appliedPlayBy?.[rd.round] ?? null);
      return { ...rd, blocks: [...factual, ...pending, ...chartBlocks, ...unresolved].sort((a, b) => (a.rows[0].pos ?? 999) - (b.rows[0].pos ?? 999)) };
    }) };
  }
  const n = model.rows.length;
  const mensC = opts.exactMensCChart === true && n === 18 && model.totalRounds === 5;
  const ladiesA = opts.exactLadiesAChart === true && n === 9 && model.totalRounds === 5;
  const sixteen = opts.exactSixteenChart === true && n === 16 && model.totalRounds === 5;
  const exactChart = mensC || ladiesA || sixteen;
  // Results-based Swiss stages share the generator's current-ranking optimizer from R3.
  // Exact approved display charts retain their own routes, regardless of policy.
  if (sequencing && !exactChart && opts.noRepeats !== false && model.format === "results_based") {
    const opening = buildProposedSwissGrid({ ...model, swissSequencing: undefined }, { ...opts, previewFinals: true });
    const factual = buildSwissGrid(model);
    const warnings: string[] = [], issues: string[] = [];
    const seeds = [...model.rows].sort((a, b) => a.seed - b.seed).map((r) => r.id);
    const names = new Map(model.rows.map((r) => [r.id, r.name]));
    return { issues, warnings, rounds: factual.map((rd) => {
      if (rd.round < 3) return opening.rounds.find((r) => r.round === rd.round) ?? rd;
      if (rd.created && !opts.partialGeneration) return { ...rd, blocks: rd.blocks.map((b) => ({ ...b, saved: true })) };
      const prevDone = model.rounds.find((r) => r.round === rd.round - 1)?.complete;
      const label = opts.appliedPlayBy?.[rd.round] ? `Play by ${fmtDay(opts.appliedPlayBy[rd.round])}` : proposedRoundSchedule(opts.schedule, rd.round, opts.courtName).label;
      const savedBlocks = rd.created ? rd.blocks.map((b) => ({ ...b, saved: true })) : [];
      const covered = new Set(savedBlocks.flatMap((b) => b.rows.flatMap((r) => (r.id ? [r.id] : []))));
      const pendingFor = (positions: number[]) => pendingSwissSlots(rd.round, positions, label, opts.appliedPlayBy?.[rd.round] ?? null);
      if (!prevDone) {
        if (!opts.partialGeneration) return { ...rd, blocks: pendingFor(seeds.map((_, i) => i + 1)) };
        // Partial generation: only pairings identical under EVERY outcome of the outstanding games,
        // for players whose own game is final, may become fixtures now; the rest stay open slots.
        const incomplete = model.rounds.filter((r) => r.round < rd.round && r.created && !r.complete).sort((a, b) => b.round - a.round)[0];
        const outstanding = incomplete?.fixtures.filter((f) => f.state === "scheduled" && f.a && f.b).map((f) => ({ a: f.a as string, b: f.b as string })) ?? [];
        const decidedGames = model.rounds.filter((r) => r.round < rd.round).flatMap((r) => r.fixtures.flatMap((f) =>
          f.state === "completed" ? [{ a: f.a, b: f.b, winner: f.winner, round: r.round }]
          : f.state === "bye" ? [{ a: f.a ?? f.b, b: null, winner: null, round: r.round }] : []));
        const settled = incomplete && outstanding.length
          ? settledSwiss({ seedOrder: seeds, decidedGames, outstanding, round: rd.round, finalRound: model.configuredRounds, tieBreaks: model.tieBreaks })
          : null;
        const pairs = settled?.enumerable ? settled.stablePairs.filter(([a, b]) => !covered.has(a) && !covered.has(b)) : [];
        const table = swissTable(seeds, decidedGames, model.tieBreaks);
        const positions = new Map(table.map((r) => [r.id, r.position]));
        const inPairs = new Set(pairs.flat());
        const openPos = table.filter((r) => !inPairs.has(r.id) && !covered.has(r.id)).map((r) => r.position);
        return { ...rd, blocks: [
          ...savedBlocks,
          ...pairs.map(([a, b], i) => ({ matchId: `swiss-partial-${rd.round}-${i}`, certified: true as const, rows: [a, b].map((id) => ({ id, pos: positions.get(id) ?? null, name: names.get(id) ?? "Unknown player", when: label, result: "", projected: true })) as [GridRow, GridRow], score: null, court: null, playBy: opts.appliedPlayBy?.[rd.round] ?? null })),
          ...pendingFor(openPos),
        ] };
      }
      const history = model.rounds.filter((r) => r.round < rd.round).flatMap((r) => r.fixtures.map((f) => ({ ...f, round: r.round })));
      const table = swissTable(seeds, history, model.tieBreaks);
      const positions = new Map(table.map((r) => [r.id, r.position]));
      try {
        const result = sequenceSwissRound({ players: table.map((r, i) => ({ ...r, points: isPositionSwap(model.tieBreaks) ? 0 : r.points, seed: i + 1 })), played: new Set(history.flatMap((f) => f.a && f.b ? [[f.a, f.b].sort().join("|")] : [])), round: rd.round, finalRound: model.configuredRounds });
        warnings.push(...result.exceptions);
        // With partial generation a round may be half-created already: only the still-missing pairs are proposed.
        return { ...rd, blocks: [...savedBlocks, ...result.pairs.filter(([a, b]) => !(a && covered.has(a)) && !(b && covered.has(b))).map(([a, b], i) => ({ matchId: `swiss-proposed-${rd.round}-${i}`, rows: [a, b].map((id) => ({ id, pos: id ? positions.get(id) ?? null : null, name: id ? names.get(id) ?? "Unknown player" : "Bye", when: label, result: "", projected: true })) as [GridRow, GridRow], score: null, court: null, playBy: opts.appliedPlayBy?.[rd.round] ?? null }))] };
      } catch (error) { issues.push(error instanceof Error ? error.message : "No legal Swiss pairing."); return rd; }
    }) };
  }
  const plan = planCategory(n, model.totalRounds);
  if (plan.issues.length) return { rounds: [], issues: plan.issues };
  const exactPlan = mensC ? uitsigMensCChart() : sixteen ? sixteenPlayerChart() : uitsigLadiesAChart();
  const template = exactChart ? exactPlan : opts.noRepeats === false ? categoryTemplate(n, model.totalRounds)
    : Array.from({ length: model.totalRounds }, (_, i) => (opts.previewFinals ? swissPreviewFinalsTemplate : preferredSwissTemplate)(n, i + 1));
  const rawTemplate = exactChart ? exactPlan : categoryTemplate(n, model.totalRounds); // slot keys for the proposed schedule
  // Exact charts are owner-approved layouts and may deliberately leave slots unpaired (e.g. Ladies A
  // round 5: 6-9 sit out), so the strict "every slot appears" validation does not apply to them.
  const issues = exactChart ? [] : validateTemplate(n, template);
  if (issues.length) return { rounds: [], issues };
  const savedFirst = buildSwissGrid(model).find((r) => r.round === 1);
  // Read-only projection: occupants entering each round, derived from seeds + saved COMPLETED results whose two
  // players match the template pair for that round (winner -> better/lower slot, loser -> worse). Unplayed = null (TBD).
  const nameOf = new Map(model.rows.map((r) => [r.id, r.name]));
  const seeds = [...model.rows].sort((x, y) => x.seed - y.seed).map((r) => r.id);
  const findDone = (round: number, x: string, y: string) => model.rounds.find((r) => r.round === round)?.fixtures
    .find((f) => f.state === "completed" && f.winner && ((f.a === x && f.b === y) || (f.a === y && f.b === x)));
  const occ: Array<Array<string | null>> = [seeds];
  const readyRounds = new Set<number>();
  // Bye fairness (same rule as the live engine): nobody sits out twice. If the bye slot's occupant already had a
  // bye, the bye moves up to the lowest slot whose occupant hasn't had one (or isn't known yet).
  const byeHolders = new Set<string>();
  const savedR1Bye = savedFirst?.created ? model.rounds.find((r) => r.round === 1)?.fixtures.find((f) => f.state === "bye") : undefined;
  for (const rd of template) {
    const cur = occ[rd.round - 1];
    if (rd.round === 1 && savedR1Bye) { const id = savedR1Bye.a ?? savedR1Bye.b; if (id) byeHolders.add(id); }
    else if (rd.bye != null) {
      const holder = cur[rd.bye - 1];
      if (!ladiesA && holder && byeHolders.has(holder)) {
        for (let sl = n; sl >= 1; sl--) {
          const o = cur[sl - 1];
          if (o && byeHolders.has(o)) continue;
          const pi = rd.pairs.findIndex((p) => p.a === sl || p.b === sl);
          if (pi < 0) break;
          const p = rd.pairs[pi], other = p.a === sl ? p.b : p.a;
          rd.pairs[pi] = { round: rd.round, a: Math.min(other, rd.bye), b: Math.max(other, rd.bye) };
          rd.bye = sl; break;
        }
      }
      const h = cur[rd.bye - 1]; if (h) byeHolders.add(h);
    }
    if (!exactChart && opts.noRepeats !== false) {
      const history = model.rounds.flatMap((r) => r.fixtures.map((f) => ({ a: f.a, b: f.b, round: r.round })));
      const locked = (model.rounds.find((r) => r.round === rd.round)?.fixtures ?? []).flatMap((f) => f.a && (f.b || f.state === "bye") ? [{ a: f.a, b: f.b }] : []);
      const strict = rd.round >= swissStrictFromRound(cur.length) ? strictSwissPlan({ occupants: cur, round: rd.round, preferred: rd.pairs, bye: rd.bye, history, locked, usePreferredTemplate: opts.previewFinals }) : { pairs: rd.pairs, bye: rd.bye, ready: true, issue: undefined };
      if (rd.round < swissStrictFromRound(cur.length) && locked.length) {
        const pos = new Map(cur.map((id, index) => [id, index + 1]));
        const actual = locked.flatMap((f) => {
          const a = pos.get(f.a), b = f.b ? pos.get(f.b) : undefined;
          return a && b ? [{ a: Math.min(a, b), b: Math.max(a, b), round: rd.round }] : [];
        });
        const used = actual.flatMap((p) => [p.a, p.b]);
        const savedBye = locked.find((f) => !f.b);
        const byeSlot = savedBye ? pos.get(savedBye.a) ?? null : null;
        if (new Set(used).size === used.length) {
          // Partial saved rounds are authoritative too; do not route their winners through stale template pairs.
          strict.pairs = [...actual, ...rd.pairs.filter((p) => !used.includes(p.a) && !used.includes(p.b) && p.a !== byeSlot && p.b !== byeSlot)].sort((a, b) => a.a - b.a);
          strict.bye = byeSlot ?? (rd.bye != null && !used.includes(rd.bye) ? rd.bye : null);
        }
      }
      if (strict.issue) issues.push(strict.issue);
      if (strict.ready) {
        readyRounds.add(rd.round);
        rd.pairs = strict.pairs.map((p) => ({ ...p, round: rd.round }));
        rd.bye = strict.bye;
      } else if (strict.issue) rd.pairs = [];
    }
    const next: Array<string | null> = Array(n).fill(null);
    for (const p of rd.pairs) {
      const x = cur[p.a - 1], y = cur[p.b - 1];
      const f = x && y ? findDone(rd.round, x, y) : undefined;
      if (f) { next[p.a - 1] = f.winner; next[p.b - 1] = f.winner === x ? y : x; }
    }
    if (rd.bye != null) next[rd.bye - 1] = cur[rd.bye - 1];
    occ.push(next);
  }
  const savedGrid = new Map(buildSwissGrid(model).map((r) => [r.round, r]));
  return { issues, rounds: template.map((rd): GridRound => {
    if (!exactChart && rd.round === 1 && savedFirst?.created) return { ...savedFirst, blocks: savedFirst.blocks.map((b) => ({ ...b, saved: true })) };
    // Saved games for this round are shown factually (real players, results, scores) — never as "projected".
    // An exact chart keeps its position routes. Only a completed game with the same occupants
    // may supply its factual result; incompatible saved games remain in Log/Calendar.
    const saved = exactChart ? [] : (savedGrid.get(rd.round)?.blocks ?? []).map((b) => ({ ...b, saved: true }));
    const savedIds = new Set(saved.flatMap((b) => b.rows.map((r) => r.id)).filter((x): x is string => !!x));
    const into = occ[rd.round - 1];
    // A round switched to Play by date (applied to live rounds) overrides stale proposed court/time slots.
    const appliedBy = opts.appliedPlayBy?.[rd.round] ?? null;
    const schedule: ProposedRoundSchedule = appliedBy ? { kind: "play_by", label: `Play by ${fmtDay(appliedBy)}` } : proposedRoundSchedule(opts.schedule, rd.round, opts.courtName);
    const pending = (pos: number | null, bye = false): GridRow => {
      // A position whose occupant is already decided by a confirmed result shows that player's name.
      const id = !bye && pos != null ? into[pos - 1] ?? null : null;
      return id ? { pos, id, name: nameOf.get(id) ?? "Unknown player", when: schedule.label, result: "", projected: true }
        : { pos, id: null, name: bye ? "Bye" : "TBD", when: bye ? null : schedule.label, result: "" };
    };
    const covered = (...ps: (number | null)[]) => ps.some((p) => { const id = p != null ? into[p - 1] : null; return !!id && savedIds.has(id); });
    const proposedBlocks: GridBlock[] = rd.pairs.flatMap((p, pi): GridBlock[] => {
      if (saved.length && covered(p.a, p.b)) return [];
      const id = `proposed-${rd.round}-${p.a}-${p.b}`;
      if (exactChart) {
        const x = into[p.a - 1], y = into[p.b - 1];
        const done = x && y ? findDone(rd.round, x, y) : undefined;
        const factual = done ? savedGrid.get(rd.round)?.blocks.find((b) => b.matchId === done.id) : undefined;
        const a = factual?.rows.find((r) => r.id === x);
        const b = factual?.rows.find((r) => r.id === y);
        if (factual && a && b) return [{ ...factual, saved: true, rows: [{ ...a, pos: p.a }, { ...b, pos: p.b }] }];
      }
      const k = rawTemplate[rd.round - 1]?.pairs[pi] ?? p;
      const scheduleKey = fixtureKey(rd.round, k.a, k.b);
      const slot: FixtureSchedule | undefined = appliedBy ? { kind: "play_by", date: appliedBy } as FixtureSchedule : opts.slots?.[fixtureKey(rd.round, k.a, k.b)];
      const withWhen = (when: string) => [{ ...pending(p.a), when }, { ...pending(p.b), when }] as [GridRow, GridRow];
      if (slot?.kind === "planned") return [{ matchId: id, scheduleKey, rows: withWhen(`Proposed: ${fmtDay(slot.date)} ${slot.time}`), score: null, court: `${slot.courtName} (proposed)`, playBy: null }];
      if (slot?.kind === "play_by") return [{ matchId: id, rows: withWhen(`Play by ${fmtDay(slot.date)}`), score: null, court: null, playBy: slot.date }];
      if (slot?.kind === "unscheduled" && (schedule.kind === "window" || /Shortage/.test(slot.reason))) return [{ matchId: id, rows: withWhen("Not allocated — no free slot left in this round"), score: null, court: null, playBy: null }];
      return [{ matchId: id, rows: [pending(p.a), pending(p.b)], score: null, court: null, playBy: null }];
    });
    if (rd.bye != null && !(saved.length && covered(rd.bye))) {
      const holder = into[rd.bye - 1];
      const bye = exactChart && holder ? model.rounds.find((r) => r.round === rd.round)?.fixtures.find((f) => f.state === "bye" && f.a === holder) : undefined;
      const factual = bye ? savedGrid.get(rd.round)?.blocks.find((b) => b.matchId === bye.id) : undefined;
      proposedBlocks.push(factual ? { ...factual, saved: true, rows: [{ ...factual.rows[0], pos: rd.bye }, factual.rows[1]] } : { matchId: `proposed-${rd.round}-bye`, rows: [pending(rd.bye), pending(null, true)], score: null, court: null, playBy: null });
    }
    // Positions orphaned because their template partner already has a saved game
    // must still be shown: pair the leftovers within their half (wide gap: i v i+len/2).
    if (saved.length && !exactChart) {
      const shown = new Set<number>();
      for (const b of proposedBlocks) for (const r of b.rows) if (r.pos != null) shown.add(r.pos);
      const savedPos = new Set<number>();
      for (const b of saved) for (const r of b.rows) if (r.pos != null) savedPos.add(r.pos);
      const left = Array.from({ length: into.length }, (_, i) => i + 1)
        .filter((p) => !shown.has(p) && !savedPos.has(p) && !covered(p));
      const halves = swissHalves(into.length);
      const groups = halves ? [left.filter((p) => p <= halves[0]), left.filter((p) => p > halves[0])] : [left];
      for (const g of groups) {
        const h = Math.floor(g.length / 2);
        for (let i = 0; i < h; i++) {
          const a = g[i], b = g[i + h];
          proposedBlocks.push({ matchId: `proposed-${rd.round}-${a}-${b}`, rows: [pending(a), pending(b)], score: null, court: null, playBy: null });
        }
        if (g.length % 2) proposedBlocks.push({ matchId: `proposed-${rd.round}-${g[g.length - 1]}-wait`, rows: [pending(g[g.length - 1]), { pos: null, id: null, name: "TBD", when: schedule.label, result: "" }], score: null, court: null, playBy: null });
      }
    }
    // Once every player in the round has a saved game, the round is fully factual.
    const allSaved = saved.length > 0 && model.rows.every((r) => savedIds.has(r.id));
    if (allSaved) return { round: rd.round, created: true, blocks: saved };
    const blocks = [...saved, ...proposedBlocks].sort((x, y) => (x.rows[0].pos ?? 999) - (y.rows[0].pos ?? 999));
    return { round: rd.round, created: false, blocks, schedule };
  }) };
}

/** Calendar entry: confirmed = saved live fixture; proposed = preview positional slot (never a booking). */
export interface SwissCalendarEntry { kind: "confirmed" | "proposed" | "play_by" | "unscheduled"; round: number; date: string | null; time: string | null; court: string | null; label: string; status?: string }
/** Read-only calendar from saved fixtures plus (optionally) proposed slots. No data is written. */
export function buildSwissCalendar(model: SwissProgressionModel, proposed?: GridRound[], slots?: Record<string, FixtureSchedule>): SwissCalendarEntry[] {
  const out: SwissCalendarEntry[] = [];
  for (const rd of model.rounds) for (const f of rd.fixtures) {
    if (f.state === "bye") continue;
    const [date, time] = f.when ? f.when.split(" ") : [null, null];
    out.push({ kind: date ? "confirmed" : f.playBy ? "play_by" : "unscheduled", round: rd.round, date: date ?? f.playBy ?? null, time: time ?? null, court: f.court, label: `${f.aLabel} v ${f.bLabel}`, status: f.state });
  }
  const live = new Set(model.rounds.filter((r) => r.created).map((r) => r.round));
  for (const rd of proposed ?? []) {
    if (live.has(rd.round)) continue;
    for (const b of rd.blocks) {
      const [a, c] = [b.rows[0].pos, b.rows[1].pos];
      if (a == null || c == null) continue;
      const s = slots?.[b.scheduleKey ?? fixtureKey(rd.round, a, c)];
      const label = `Position ${a} v Position ${c} (TBD)`;
      if (s?.kind === "planned") out.push({ kind: "proposed", round: rd.round, date: s.date, time: s.time, court: s.courtName, label });
      else if (s?.kind === "play_by") out.push({ kind: "play_by", round: rd.round, date: s.date, time: null, court: null, label });
      else out.push({ kind: "unscheduled", round: rd.round, date: null, time: null, court: null, label });
    }
  }
  return out.sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999") || (x.time ?? "99").localeCompare(y.time ?? "99") || (x.court ?? "").localeCompare(y.court ?? ""));
}
