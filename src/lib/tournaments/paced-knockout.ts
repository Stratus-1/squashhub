/**
 * Paced knockout — a fresh, week-by-week knockout engine.
 *
 * Rules (never borrowed from round robin):
 *  - A knockout is elimination. Losers leave the active field; anyone not yet
 *    scheduled, or who received a bye / waited a round, stays active.
 *  - Only the CURRENT scheduling round is ever proposed. Future fixtures are
 *    never created on the assumption of a winner.
 *  - Eliminations needed = active − milestone field size (QF 8, SF 4, Final 2).
 *    "Paced" spreads them across the scheduling rounds left before the
 *    milestone; "Immediate" plays as many as the field allows each round.
 *  - The milestone comes from the existing Stages & scheduling setup: a
 *    league's own play-off stages win; otherwise the shared ("All categories")
 *    play-off stages apply when play-off dates are synchronised. No new rule.
 *
 * Pure: everything is derived from match rows + the saved plan.
 */
import { winnerOf, type KnockoutMatchLike } from "./knockout";

export type KnockoutPace = "paced" | "immediate";
export type KnockoutPairing = "progressive" | "traditional";

const DONE = new Set(["completed", "complete", "walkover", "forfeit"]);
const VOID = new Set(["cancelled", "void", "withdrawn"]);

export function isDecided(m: KnockoutMatchLike): boolean {
  if (m.is_bye) return false;
  return DONE.has(String(m.status || "").toLowerCase()) && !!winnerOf(m);
}

const sideA = (m: KnockoutMatchLike) => [m.player_a_member_id, m.partner_a_member_id].filter(Boolean) as string[];
const sideB = (m: KnockoutMatchLike) => [m.player_b_member_id, m.partner_b_member_id].filter(Boolean) as string[];

export type FieldEntry = { id: string; partnerId?: string | null; rank?: number | null };

export type ActiveField = {
  active: FieldEntry[];
  eliminated: Array<FieldEntry & { round: number }>;
  /** Active entrants currently in an unfinished fixture. */
  inPlay: string[];
  /** Highest round number that has fixtures. */
  lastRound: number;
  /** The last round still has unfinished fixtures. */
  roundOpen: boolean;
};

/**
 * Active field of ONE division: every entrant (registrations + anyone who
 * appeared in its knockout rows) minus losers. Byes and waiting never eliminate.
 */
export function activeField(entrants: FieldEntry[], rows: KnockoutMatchLike[]): ActiveField {
  const byId = new Map<string, FieldEntry>();
  for (const e of entrants) if (e.id && !byId.has(e.id)) byId.set(e.id, e);
  const live = rows.filter((m) => !VOID.has(String(m.status || "").toLowerCase()));
  for (const m of live) {
    for (const [p, q] of [[m.player_a_member_id, m.partner_a_member_id], [m.player_b_member_id, m.partner_b_member_id]] as const) {
      if (p && !byId.has(p) && ![...byId.values()].some((e) => e.partnerId === p)) byId.set(p, { id: p, partnerId: q ?? null });
    }
  }
  const lead = (id: string) => (byId.has(id) ? id : [...byId.values()].find((e) => e.partnerId === id)?.id ?? id);
  const out = new Map<string, number>();
  const inPlay = new Set<string>();
  let lastRound = 0;
  let roundOpen = false;
  const sorted = [...live].sort((a, b) => (Number(a.round_number) || 0) - (Number(b.round_number) || 0));
  for (const m of sorted) lastRound = Math.max(lastRound, Number(m.round_number) || 0);
  for (const m of sorted) {
    const r = Number(m.round_number) || 0;
    if (m.is_bye) continue;
    if (!isDecided(m)) {
      for (const id of [...sideA(m), ...sideB(m)]) inPlay.add(lead(id));
      if (r === lastRound) roundOpen = true;
      continue;
    }
    const w = winnerOf(m)!;
    const lost = sideA(m).includes(w) ? sideB(m) : sideB(m).includes(w) ? sideA(m) : [];
    for (const id of lost) { const k = lead(id); if (!out.has(k)) out.set(k, r); }
  }
  const all = [...byId.values()];
  return {
    active: all.filter((e) => !out.has(e.id)),
    eliminated: all.filter((e) => out.has(e.id)).map((e) => ({ ...e, round: out.get(e.id)! })),
    inPlay: [...inPlay].filter((id) => !out.has(id)),
    lastRound,
    roundOpen,
  };
}

/** Field size a milestone stage name implies (QF 8, SF 4, Final 2); null if unknown. */
export function fieldSizeForStage(name: string): number | null {
  const s = name.toLowerCase();
  if (/quarter|\bqf\b/.test(s)) return 8;
  if (/semi|\bsf\b/.test(s)) return 4;
  if (/final/.test(s)) return 2;
  const m = s.match(/(?:round|last) of (\d+)/);
  return m ? Number(m[1]) : null;
}

/** Most eliminations possible over `rounds` rounds, starting with `active`, never going below `target`. */
export function capacity(active: number, rounds: number, target: number): number {
  let a = active, total = 0;
  for (let r = 0; r < rounds && a > target; r++) {
    const x = Math.min(Math.floor(a / 2), a - target);
    total += x; a -= x;
  }
  return total;
}

export type PaceStatus = "on_track" | "at_risk" | "behind" | "done" | "free";

export type PacePlan = {
  needed: number;
  thisRound: number;
  /** Fewest matches this round that still reaches the milestone on time. */
  minimumNow: number;
  status: PaceStatus;
  warning: string | null;
};

/**
 * How many elimination matches to schedule this round.
 * `roundsLeft` counts this round. `target` null = no milestone (own process
 * without dates): play down towards a champion at the chosen pace.
 */
export function pacePlan(o: { active: number; target: number | null; roundsLeft: number | null; pace: KnockoutPace; milestoneLabel?: string | null }): PacePlan {
  const target = Math.max(1, o.target ?? 1);
  const needed = Math.max(0, o.active - target);
  const maxNow = Math.min(Math.floor(o.active / 2), needed);
  const label = o.milestoneLabel || (o.target ? `a field of ${o.target}` : "a winner");
  if (needed === 0) return { needed, thisRound: 0, minimumNow: 0, status: "done", warning: null };
  if (o.target == null || o.roundsLeft == null) {
    const n = o.pace === "immediate" || o.roundsLeft == null ? maxNow : Math.min(maxNow, Math.ceil(needed / Math.max(1, o.roundsLeft)));
    return { needed, thisRound: n, minimumNow: 0, status: "free", warning: null };
  }
  const rounds = Math.max(0, o.roundsLeft);
  if (rounds === 0) {
    return { needed, thisRound: 0, minimumNow: needed, status: "behind", warning: `No scheduling rounds are left before ${label}, but ${needed} elimination${needed === 1 ? " is" : "s are"} still needed. Add a play-by date or move the milestone.` };
  }
  let minimumNow = maxNow + 1;
  for (let x = 0; x <= maxNow; x++) {
    if (x + capacity(o.active - x, rounds - 1, target) >= needed) { minimumNow = x; break; }
  }
  if (minimumNow > maxNow) {
    const cap = capacity(o.active, rounds, target);
    return { needed, thisRound: maxNow, minimumNow: maxNow, status: "behind", warning: `${label} can't be reached on time: ${needed} eliminations are needed but at most ${cap} fit in the ${rounds} round${rounds === 1 ? "" : "s"} left. Add a scheduling round or change the milestone.` };
  }
  const even = Math.ceil(needed / rounds);
  const thisRound = o.pace === "immediate" ? maxNow : Math.min(maxNow, Math.max(even, minimumNow));
  const atRisk = minimumNow > 0 && (minimumNow > even || (minimumNow === maxNow && rounds > 1));
  return {
    needed, thisRound, minimumNow,
    status: atRisk ? "at_risk" : "on_track",
    warning: atRisk ? `${minimumNow} match${minimumNow === 1 ? "" : "es"} must now be completed this round to reach ${label} on time.` : null,
  };
}

export type ProposedPairing = { pairs: Array<[FieldEntry, FieldEntry]>; waiting: FieldEntry[] };

/** Rank order: lower `rank` = stronger; unranked last, keeping input order. */
export function byRank(field: FieldEntry[]): FieldEntry[] {
  return field.map((e, i) => ({ e, i })).sort((x, y) => (x.e.rank ?? Infinity) - (y.e.rank ?? Infinity) || x.i - y.i).map((x) => x.e);
}

/**
 * Pick `count` matches from the active field. The strongest wait (they have
 * effectively a bye — never an elimination); the weakest 2·count play.
 * Traditional: strongest v weakest inside the playing group (1v8, 2v7…).
 * Progressive: neighbours from the bottom up (closer-ranked, weaker v weaker).
 */
export function proposePairings(field: FieldEntry[], count: number, strategy: KnockoutPairing): ProposedPairing {
  const ranked = byRank(field);
  const n = Math.max(0, Math.min(count, Math.floor(ranked.length / 2)));
  const playing = ranked.slice(ranked.length - 2 * n);
  const waiting = ranked.slice(0, ranked.length - 2 * n);
  const pairs: Array<[FieldEntry, FieldEntry]> = [];
  if (strategy === "traditional") {
    for (let i = 0; i < n; i++) pairs.push([playing[i], playing[playing.length - 1 - i]]);
  } else {
    for (let i = playing.length - 1; i > 0; i -= 2) pairs.push([playing[i - 1], playing[i]]);
  }
  return { pairs, waiting };
}

/* ── milestone from the existing Stages & scheduling answers ── */

export type PlanStage = { unit?: string; name?: string; phase?: string; mode?: string; date?: string; deadline?: string };
export type Milestone = {
  source: "shared" | "own" | "none";
  label: string | null;
  fieldSize: number | null;
  date: string | null;
  /** Main-phase scheduling round dates before the milestone, in order. */
  roundDates: string[];
};

const when = (s: PlanStage) => s.date || s.deadline || "";
const forUnit = (s: PlanStage, key: string) => s.unit === key || s.unit === key.split("::")[0];

/**
 * Which milestone this league paces towards. Uses the existing per-league
 * choice exactly as saved: own play-off stages (stage set to this category)
 * win; otherwise shared "All categories" play-off stages apply unless play-off
 * dates were chosen per category (`playoffSync === false`).
 */
export function milestoneFor(plan: { stages?: PlanStage[]; playoffSync?: boolean | "later" | null } | null, key: string): Milestone {
  const stages = (plan?.stages ?? []).filter(Boolean);
  const po = stages.filter((s) => s.phase === "playoff" && s.name);
  const own = po.filter((s) => forUnit(s, key));
  const shared = plan?.playoffSync === false ? [] : po.filter((s) => !s.unit);
  const pick = own.length ? own : shared;
  const source: Milestone["source"] = own.length ? "own" : shared.length ? "shared" : "none";
  const first = [...pick].sort((a, b) => when(a).localeCompare(when(b)))[0] ?? null;
  const date = first ? when(first) || null : null;
  const main = stages.filter((s) => (s.phase ?? "main") === "main" && (!s.unit || forUnit(s, key)) && when(s));
  const roundDates = [...new Set(main.map(when))].filter((d) => !date || d < date).sort();
  return { source, label: first?.name ?? null, fieldSize: first ? fieldSizeForStage(first.name!) : null, date, roundDates };
}

/** Scheduling rounds left (including the next one), given rounds already created. */
export function roundsLeftFor(m: Milestone, roundsCreated: number): number | null {
  if (!m.roundDates.length) return null;
  return Math.max(0, m.roundDates.length - roundsCreated);
}

/* ── knockout inside pools ──
 * A pool is only a partition of entrants. In a knockout tournament each pool is
 * reduced by elimination (never round robin) until it holds its qualifiers; the
 * configured play-off / crossover then takes over from the combined survivors.
 */

/** Survivors each pool must be reduced to. Explicit per-pool qualifiers win; else the milestone field is split evenly; no milestone = pool winner. */
export function poolKnockoutTarget(milestoneField: number | null, pools: number, perPool?: number | null): number {
  if (perPool && perPool > 0) return perPool;
  if (milestoneField && pools > 0) return Math.max(1, Math.ceil(milestoneField / pools));
  return 1;
}

/** First-round match counts per pool from the pace rules. */
export function pooledRoundCounts(poolSizes: number[], o: { target: number; roundsLeft: number | null; pace: KnockoutPace }): number[] {
  return poolSizes.map((n) => pacePlan({ active: n, target: o.target, roundsLeft: o.roundsLeft, pace: o.pace }).thisRound);
}
