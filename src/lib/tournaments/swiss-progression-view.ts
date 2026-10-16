/**
 * Read-only Swiss progression model for the Riverside pilot view (`tournament_swiss_progression_view`).
 * Pure and display-only: it reads saved matches exactly as stored and never re-pairs, re-scores or
 * rewrites anything. Existing Swiss stages ("results-based" pairing, incl. position_swap ranking) are
 * replayed with the SAME `swissTable` the live standings use, so old results are never reinterpreted.
 * The new positional format (Phase 1 templates) is only labelled here; it is not active anywhere.
 */
import { swissTable, type SwissGame } from "@/lib/tournaments/swiss-standings";
import { fixtureKey, type FixtureSchedule } from "@/lib/tournaments/swiss-positional-draw";
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
  /** Position from the Swiss stage's own rounds only (1..configuredRounds); null when those rounds aren't all complete. */
  swissFinalPosition?: number | null;
}
export interface SwissProgressionModel {
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
  // Swiss-stage-only final standing: configured rounds, ignoring follow-up stage games that share the round axis.
  const configuredRounds = Math.min(input.totalRounds ?? totalRounds, totalRounds);
  const swissRounds = rounds.filter((rd) => rd.round <= configuredRounds);
  const swissStageComplete = swissRounds.length > 0 && swissRounds.every((rd) => rd.complete);
  const swissFinal = new Map(swissTable(ids, gamesUpTo(configuredRounds), tieBreaks).map((t) => [t.id, t.position]));

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

  return { format: input.format ?? "results_based", totalRounds, configuredRounds, swissStageComplete, rounds, rows };
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
export interface GridBlock { matchId: string; rows: [GridRow, GridRow]; score: string | null; court: string | null; playBy: string | null }
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
 * Occupant-aware bye/rematch adjustments require separately approved engine integration.
 */
export function buildProposedSwissGrid(model: SwissProgressionModel, opts: { schedule?: StageScheduleConfig | null; courtName?: (id: number | string) => string; slots?: Record<string, FixtureSchedule>; appliedPlayBy?: Record<number, string> } = {}): { rounds: GridRound[]; issues: string[] } {
  const n = model.rows.length;
  const plan = planCategory(n, model.totalRounds);
  if (plan.issues.length) return { rounds: [], issues: plan.issues };
  const template = categoryTemplate(n, model.totalRounds);
  const rawTemplate = categoryTemplate(n, model.totalRounds); // slot keys for the proposed schedule
  const issues = validateTemplate(n, template);
  if (issues.length) return { rounds: [], issues };
  const savedFirst = buildSwissGrid(model).find((r) => r.round === 1);
  // Read-only projection: occupants entering each round, derived from seeds + saved COMPLETED results whose two
  // players match the template pair for that round (winner -> better/lower slot, loser -> worse). Unplayed = null (TBD).
  const nameOf = new Map(model.rows.map((r) => [r.id, r.name]));
  const seeds = [...model.rows].sort((x, y) => x.seed - y.seed).map((r) => r.id);
  const findDone = (round: number, x: string, y: string) => model.rounds.find((r) => r.round === round)?.fixtures
    .find((f) => f.state === "completed" && f.winner && ((f.a === x && f.b === y) || (f.a === y && f.b === x)));
  const occ: Array<Array<string | null>> = [seeds];
  // Bye fairness (same rule as the live engine): nobody sits out twice. If the bye slot's occupant already had a
  // bye, the bye moves up to the lowest slot whose occupant hasn't had one (or isn't known yet).
  const byeHolders = new Set<string>();
  const savedR1Bye = savedFirst?.created ? model.rounds.find((r) => r.round === 1)?.fixtures.find((f) => f.state === "bye") : undefined;
  for (const rd of template) {
    const cur = occ[rd.round - 1];
    if (rd.round === 1 && savedR1Bye) { const id = savedR1Bye.a ?? savedR1Bye.b; if (id) byeHolders.add(id); }
    else if (rd.bye != null) {
      const holder = cur[rd.bye - 1];
      if (holder && byeHolders.has(holder)) {
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
    const next: Array<string | null> = Array(n).fill(null);
    for (const p of rd.pairs) {
      const x = cur[p.a - 1], y = cur[p.b - 1];
      const f = x && y ? findDone(rd.round, x, y) : undefined;
      if (f) { next[p.a - 1] = f.winner; next[p.b - 1] = f.winner === x ? y : x; }
    }
    if (rd.bye != null) next[rd.bye - 1] = cur[rd.bye - 1];
    occ.push(next);
  }
  return { issues: [], rounds: template.map((rd): GridRound => {
    if (rd.round === 1 && savedFirst?.created) return savedFirst;
    const into = occ[rd.round - 1];
    // A round switched to Play by date (applied to live rounds) overrides stale proposed court/time slots.
    const appliedBy = opts.appliedPlayBy?.[rd.round] ?? null;
    const schedule: ProposedRoundSchedule = appliedBy ? { kind: "play_by", label: `Play by ${fmtDay(appliedBy)}` } : proposedRoundSchedule(opts.schedule, rd.round, opts.courtName);
    const pending = (pos: number | null, bye = false): GridRow => {
      const id = !bye && pos != null ? into[pos - 1] ?? null : null;
      return id ? { pos, id, name: nameOf.get(id) ?? "Unknown player", when: schedule.label, result: "", projected: true }
        : { pos, id: null, name: bye ? "Bye" : "TBD", when: bye ? null : schedule.label, result: "" };
    };
    const blocks: GridBlock[] = rd.pairs.map((p, pi) => {
      const id = `proposed-${rd.round}-${p.a}-${p.b}`;
      const k = rawTemplate[rd.round - 1]?.pairs[pi] ?? p;
      const slot: FixtureSchedule | undefined = appliedBy ? { kind: "play_by", date: appliedBy } as FixtureSchedule : opts.slots?.[fixtureKey(rd.round, k.a, k.b)];
      const withWhen = (when: string) => [{ ...pending(p.a), when }, { ...pending(p.b), when }] as [GridRow, GridRow];
      if (slot?.kind === "planned") return { matchId: id, rows: withWhen(`Proposed: ${fmtDay(slot.date)} ${slot.time}`), score: null, court: `${slot.courtName} (proposed)`, playBy: null };
      if (slot?.kind === "play_by") return { matchId: id, rows: withWhen(`Play by ${fmtDay(slot.date)}`), score: null, court: null, playBy: slot.date };
      if (slot?.kind === "unscheduled" && (schedule.kind === "window" || /Shortage/.test(slot.reason))) return { matchId: id, rows: withWhen("Not allocated — no free slot left in this round"), score: null, court: null, playBy: null };
      return { matchId: id, rows: [pending(p.a), pending(p.b)], score: null, court: null, playBy: null };
    });
    if (rd.bye != null) blocks.push({ matchId: `proposed-${rd.round}-bye`, rows: [pending(rd.bye), pending(null, true)], score: null, court: null, playBy: null });
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
      const s = slots?.[fixtureKey(rd.round, a, c)];
      const label = `Position ${a} v Position ${c} (TBD)`;
      if (s?.kind === "planned") out.push({ kind: "proposed", round: rd.round, date: s.date, time: s.time, court: s.courtName, label });
      else if (s?.kind === "play_by") out.push({ kind: "play_by", round: rd.round, date: s.date, time: null, court: null, label });
      else out.push({ kind: "unscheduled", round: rd.round, date: null, time: null, court: null, label });
    }
  }
  return out.sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999") || (x.time ?? "99").localeCompare(y.time ?? "99") || (x.court ?? "").localeCompare(y.court ?? ""));
}
