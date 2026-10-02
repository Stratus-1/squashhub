/**
 * Step-by-Step Beta → structured engine bridge for "Generate draw & fixtures".
 *
 * Pure helpers: turn CURRENT active registrations into competitive units (pairs never split),
 * propose a per-division format from the device-local Step plan, validate it, and build the
 * TournamentSpec the existing structured engine (engine-service / structured-persist) generates from.
 * Nothing here writes; persistence is `step_prepare_draw` + the engine's structured_commit.
 */
import { readTournamentPlan } from "./step-storage";
import { buildPlayoffChain } from "./playoff-chain";
import { generateFromSpec, type PlannedPlayoff, type TournamentSpec } from "@/lib/tournaments/engine-service";
import { nextPow2, roundRobin } from "@/lib/tournaments/contract";
import type { PoolReview } from "@/lib/smart-builder/pool-plan";
import { distributeIntoPools, type PoolAllocationMode } from "@/lib/tournaments/pools";
import { poolAssignmentIssues } from "@/lib/tournaments/pool-boundaries";
import { specDateIssues } from "@/lib/tournaments/date-window";

export type DrawKind = "pools" | "round_robin" | "knockout" | "swiss" | "cross";
export type DrawSeeding = "entry_order" | "random" | "ladder" | "ranking";
/**
 * Schedule. play_by: one or more deadlines (sorted). With several, `upto[k]` = last engine round due by deadlines[k]
 * (null = proposed even split, shown in the preview); the last deadline covers the remaining rounds.
 */
export type DivSchedule = { rule: "play_by" | "fixed" | null; deadlines: string[]; upto: (number | null)[]; dates: string[]; /** Organiser explicitly lets several rounds share one play-by date. */ share?: boolean };
export type DivFormat = {
  kind: DrawKind | null;
  pools: number;
  swissRounds: number;
  seeding: DrawSeeding;
  schedule: DivSchedule;
  /** cross: every tournament group in this cross-league set (incl. its own). Each group plays every other group. */
  crossGroups: number[];
  /** cross: "Choose which groups play each other" — the exact groups this one plays. null/undefined = all selected groups play each other. */
  crossVs?: number[] | null;
};
export type RegLite = { club_member_id: string; partner_member_id: string | null; status: string; division_choices: number[] | null };
export type DrawUnit = { member: string; partner: string | null };
export type DrawDivision = { group: number; label: string; doubles: boolean; units: DrawUnit[]; format: DivFormat; notes: string[]; playoffs: string[]; playoffPlans?: Array<PlannedPlayoff | null>; blockers?: string[];
  /** Organiser-adjusted pools (unit ids per pool). When set, this IS what Generate saves. */
  manualPools?: string[][] | null;
  /** Pool rule review from the actual entrants (Step setup "Pool structure"). */
  poolReview?: PoolReview | null;
  /** Organiser accepted/adjusted the pools ("Decide after entries close" needs this before generating). */
  poolAccepted?: boolean;
  /** Play-off qualifiers from the pool rule: per pool (null = derived) and best runners-up. */
  poolQualifiers?: { perPool: number | null; runnersUp: number } | null };

const INACTIVE = new Set(["cancelled", "withdrawn", "declined"]);
export const unitId = (u: DrawUnit) => (u.partner ? `${u.member}+${u.partner}` : u.member);

/** Active registrations → units per division. Doubles units need a reciprocal pair in the same division. */
export function unitsFor(regs: RegLite[], group: number, nGroups: number, doubles: boolean): { units: DrawUnit[]; errors: string[] } {
  const inDiv = (r: RegLite) => nGroups <= 1 || !r.division_choices?.length || r.division_choices.includes(group);
  const live = regs.filter((r) => !INACTIVE.has(String(r.status)));
  const mine = live.filter(inDiv);
  const errors: string[] = [];
  if (!doubles) return { units: mine.map((r) => ({ member: r.club_member_id, partner: null })), errors };
  const byMember = new Map(live.map((r) => [r.club_member_id, r]));
  const used = new Set<string>();
  const units: DrawUnit[] = [];
  for (const r of mine) {
    if (used.has(r.club_member_id)) continue;
    if (!r.partner_member_id) { errors.push("an entry has no doubles partner"); continue; }
    const p = byMember.get(r.partner_member_id);
    if (!p || p.partner_member_id !== r.club_member_id) { errors.push("a partner's entry does not point back to the same pair"); continue; }
    if (!inDiv(p)) { errors.push("a pair's partners are in different categories"); continue; }
    if (used.has(p.club_member_id)) { errors.push("a player is claimed by two pairs"); continue; }
    used.add(r.club_member_id); used.add(p.club_member_id);
    units.push({ member: r.club_member_id, partner: p.club_member_id });
  }
  return { units, errors: [...new Set(errors)] };
}

/** Deterministic shuffle (seeded) so the preview and the saved draw match. */
export function shuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs]; let s = seed >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** Seed order (strongest first). Ladder: best (lowest) position of the unit's players; unknown last. */
export function orderUnits(units: DrawUnit[], seeding: DrawSeeding, opts: { seed: number; ladder?: Map<string, number | null>; points?: Map<string, number | null> }): DrawUnit[] {
  if (seeding === "random") return shuffle(units, opts.seed);
  if (seeding === "ranking") {
    // Club ranking points: a pair's strength = both players' points combined; higher first, ties keep entry order.
    const pts = (u: DrawUnit) => [u.member, u.partner].filter(Boolean).reduce((s, id) => s + (opts.points?.get(id!) ?? 0), 0);
    return [...units].map((u, i) => ({ u, i })).sort((x, y) => pts(y.u) - pts(x.u) || x.i - y.i).map((x) => x.u);
  }
  if (seeding === "ladder") {
    const pos = (u: DrawUnit) => Math.min(...[u.member, u.partner].filter(Boolean).map((id) => opts.ladder?.get(id!) ?? Infinity));
    return [...units].map((u, i) => ({ u, i })).sort((x, y) => pos(x.u) - pos(y.u) || x.i - y.i).map((x) => x.u);
  }
  return units;
}

/**
 * "Use rankings" must use the ranking matching the event level. SquashHub holds club ranking points per member
 * (club_members.ranking_points); it holds no regional or national ranking. Returns a blocking message, never a fallback.
 */
export function rankingIssue(units: DrawUnit[], scope: string | null | undefined, points: Map<string, number | null>): string | null {
  if (scope === "regional" || scope === "national")
    return `Seeding is "Use rankings" at ${scope} level, but SquashHub has no ${scope} ranking for these players. Add that ranking, or change the seeding in your setup — it is not changed here.`;
  if (scope !== "club") return `Seeding is "Use rankings" but the event level (club, regional or national) isn't known, so the right ranking can't be chosen. Set the event level in your setup first.`;
  const ids = units.flatMap((u) => [u.member, u.partner]).filter(Boolean) as string[];
  if (!ids.some((id) => (points.get(id) ?? 0) > 0))
    return `Seeding is "Use rankings" but none of these players has club ranking points yet. Record ranking points before generating, or change the seeding in your setup.`;
  return null;
}

/* ── proposal from the device-local Step plan ── */

type Plan = Record<string, any>;
export function readStepPlan(clubId: string, tournamentId: string): Plan | null {
  try { return readTournamentPlan(clubId, tournamentId); } catch { return null; }
}
/** Draw-relevant subset of the Step answers saved on the tournament (beta_lifecycle.format_plan). */
export const DRAW_PLAN_KEYS = ["format", "formatOverrides", "seeding", "seedingOverrides", "stages", "days", "playoff", "playoffOverrides", "scope", "poolPlan"] as const;
export function drawPlanOf(a: Plan): Plan { const o: Plan = {}; for (const k of DRAW_PLAN_KEYS) if (a[k] !== undefined) o[k] = a[k]; return o; }
/** "Mens › A 1st League · Doubles" → plan key "Mens::A 1st League". */
export const unitKeyOf = (label: string) => label.replace(/ · (Singles|Doubles|Singles and Doubles)$/i, "").split(" › ").join("::");
/** Parent category of a division label ("Mens › A · Doubles" → "Mens"). */
export const unitParentOf = (label: string) => unitKeyOf(label).split("::")[0];

/** Play-off phase stages from the saved stage timeline that apply to this unit, in play order. */
export function plannedPlayoffStages(plan: Plan | null, key: string): Array<{ name: string; plan: PlannedPlayoff }> {
  const rows: any[] = (plan?.stages ?? []).filter((s: any) => s?.phase === "playoff" && s.name && (!s.unit || s.unit === key || s.unit === key.split("::")[0]));
  const when = (s: any) => `${s.date || s.deadline || "9999"} ${s.from || ""}`;
  return rows.map((s, i) => ({ s, i })).sort((x, y) => when(x.s).localeCompare(when(y.s)) || x.i - y.i).map(({ s }) => ({
    name: String(s.name),
    plan: { pairing: s.pairing ?? null, mode: s.mode ?? null, date: s.date || null, deadline: s.deadline || null, from: s.from || null, to: s.to || null, courtIds: (s.courtIds ?? []).map(Number).filter((n: number) => Number.isFinite(n)), trigger: s.start === "auto" ? "auto" : s.start === "confirm" ? "confirm" : null },
  }));
}

/** Deferred (Define later) play-off stages for a division, carrying the builder's plan for each. */
export function deferredFor(version: string, names: string[], plans?: Array<PlannedPlayoff | null>) {
  return names.map((name, i) => {
    const plan = plans?.[i] ?? null;
    return { stageKey: `${version}-po${i + 1}`, name, plannedDate: plan?.date || plan?.deadline || null, ...(plan ? { plan } : {}) };
  });
}

/**
 * Repair for draws generated before play-offs were bridged: attach the planned play-offs as deferred stages to
 * every division that has none and no later stage yet. Never touches existing stages, games or results.
 */
export function attachPlannedPlayoffs(spec: TournamentSpec, plan: Plan | null): TournamentSpec | null {
  if (!plan || !spec?.divisions?.length) return null;
  let changed = false;
  const divisions = spec.divisions.map((d: any) => {
    if ((d.deferredStages ?? []).length || d.stages.length > 1) return d;
    const label = (d.poolLabels?.[0] as string | undefined) ?? d.label;
    const p = proposeFormat(plan, label);
    if (!p.playoffs.length) return d;
    const version = String(d.stages[0]?.id ?? "s").replace(/-main$/, "");
    changed = true;
    // Setup never confirmed the play-offs (historical "Decide later"): keep organiser confirmation.
    const legacy = (playoffAnswer(plan, label)?.choice ?? "later") !== "playoffs";
    return { ...d, ...playoffStagesFor(d.stages[0], version, p, { forceConfirm: legacy }) };
  });
  return changed ? { ...spec, divisions } : null;
}

const playoffAnswer = (plan: Plan | null, label: string) => {
  const key = unitKeyOf(label);
  return plan?.playoffOverrides?.[key] ?? plan?.playoffOverrides?.[key.split("::")[0]] ?? plan?.playoff ?? null;
};

/**
 * Planned play-offs as REAL predefined stages (progression runs them; Final ← Semifinal winners) when the
 * plan is complete; otherwise the "Define later" stages as before, set up when the main stage finishes.
 */
export function playoffStagesFor(main: any, version: string, p: { playoffs: string[]; playoffPlans?: Array<PlannedPlayoff | null>; poolQualifiers?: { perPool: number | null; runnersUp: number } | null }, opts: { forceConfirm?: boolean } = {}): { stages: any[]; deferredStages: any[] } {
  const plans = p.playoffPlans ?? p.playoffs.map(() => null);
  if (p.playoffs.length && plans.every(Boolean)) {
    const chain = buildPlayoffChain(main, version, p.playoffs.map((name, i) => ({ name, plan: plans[i]! })), { ...opts, qualifiers: p.poolQualifiers ?? null });
    if (!chain.reason) return { stages: [main, ...chain.stages], deferredStages: [] };
  }
  return { stages: [main], deferredStages: deferredFor(version, p.playoffs, p.playoffPlans) };
}

export function proposeFormat(plan: Plan | null, label: string): { format: DivFormat; notes: string[]; playoffs: string[]; playoffPlans: Array<PlannedPlayoff | null>; crossKeys: string[]; crossPairKeys: string[][] | null; crossByParent: boolean } {
  const key = unitKeyOf(label);
  const pick = <T,>(o: Record<string, T> | undefined, d: T): T => o?.[key] ?? o?.[key.split("::")[0]] ?? d;
  const notes: string[] = [];
  const f = pick(plan?.formatOverrides, plan?.format) ?? {};
  let kind: DrawKind | null = null;
  let crossKeys: string[] = [];
  let crossPairKeys: string[][] | null = null;
  let crossByParent = false;
  if (f.kind === "pools") kind = Number(f.pools) > 1 ? "pools" : "round_robin";
  else if (f.kind === "knockout" || f.kind === "swiss") kind = f.kind;
  else if (f.kind === "cross") {
    kind = "cross";
    crossKeys = (f.crossUnits?.length ? f.crossUnits : [f.crossA, f.crossB]).filter(Boolean);
    if (f.crossMode === "parent") crossByParent = true;
    else if (f.crossMode === "chosen") crossPairKeys = (f.crossPairs ?? []).filter((x: any) => Array.isArray(x) && x.length === 2);
  }
  else notes.push(plan ? "Format was left as \"Decide later\" — choose it now." : "The setup answers aren't on this device — choose the format.");
  const sd = pick<string | null>(plan?.seedingOverrides, plan?.seeding ?? null);
  const seeding: DrawSeeding = sd === "random" ? "random" : sd === "ladder" ? "ladder" : sd === "ranking" ? "ranking" : "entry_order";
  if (sd === "manual") notes.push(`Seeding "Manual seeds" — entry order is shown; change the order before generating if needed.`);
  const stages: any[] = (plan?.stages ?? []).filter((s: any) => (s.phase ?? "main") === "main" && (!s.unit || s.unit === key || s.unit === key.split("::")[0]));
  let schedule: DivSchedule = { rule: null, deadlines: [], upto: [], dates: [] };
  if (stages.length && stages.every((s) => s.mode === "play_by" && s.deadline)) {
    const ds = [...new Set<string>(stages.map((s) => s.deadline))].sort();
    schedule = { rule: "play_by", deadlines: ds, upto: ds.slice(1).map(() => null), dates: [] };
  } else if (stages.length && stages.every((s) => s.mode === "scheduled" && s.date)) {
    schedule = { rule: "fixed", deadlines: [], upto: [], dates: stages.map((s) => s.date).sort() };
    notes.push("Scheduled rounds get their date; court times and courts are not invented — book them separately.");
  } else if (!stages.length && plan?.days?.length) {
    schedule = { rule: "fixed", deadlines: [], upto: [], dates: [...new Set<string>(plan.days.map((d: any) => d.date).filter(Boolean))].sort() };
  } else if (stages.length) notes.push("Some stages are still \"Decide later\" — choose play-by or fixed dates now.");
  const po = pick(plan?.playoffOverrides, plan?.playoff) ?? {};
  // Play-off stages the organiser already put in the stage timeline win over the generic playoff answer.
  const planned = kind && kind !== "knockout" && po.choice !== "none" ? plannedPlayoffStages(plan, key) : [];
  const playoffs = planned.length ? planned.map((s) => s.name)
    : kind && kind !== "knockout" && po.choice === "playoffs"
      ? (po.rounds === 1 ? ["Final"] : po.rounds === 2 ? ["Semi-final", "Final"] : ["Quarter-final", "Semi-final", "Final"]) : [];
  const playoffPlans = planned.length ? planned.map((s) => s.plan) : playoffs.map(() => null);
  return { format: { kind, pools: Math.max(1, Number(f.pools) || 1), swissRounds: Math.max(0, Number(f.swissRounds) || 0), seeding, schedule, crossGroups: [], crossVs: null }, notes, playoffs, playoffPlans, crossKeys, crossPairKeys, crossByParent };
}

/* ── pools preview (source of truth for Generate) ── */

/**
 * Default pools from the existing tournament-builder allocation (`src/lib/tournaments/pools.ts`): the tournament's
 * pool_allocation mode (snake = even pools, banded = Pool A strongest) applied to the seed order.
 */
export function defaultPools(units: DrawUnit[], n: number, mode: PoolAllocationMode = "snake"): string[][] {
  return distributeIntoPools(units.map(unitId), Math.max(1, n), { mode });
}
/** Pools shown and saved: the organiser's arrangement when they moved anyone, else the default. Null = format has no pools. */
export function poolsFor(d: DrawDivision, mode: PoolAllocationMode = "snake"): string[][] | null {
  if (d.format.kind === "pools") return d.manualPools ?? defaultPools(d.units, d.format.pools, mode);
  if (d.format.kind === "round_robin") return [d.units.map(unitId)];
  return null;
}
function poolBlocks(d: DrawDivision): string[] {
  if (d.format.kind !== "pools") return [];
  const out: string[] = [];
  const pools = poolsFor(d);
  if (d.manualPools && d.manualPools.length !== d.format.pools) out.push("your pool changes no longer match the pool count — reset the pools");
  out.push(...poolAssignmentIssues(pools, d.units.map(unitId), d.doubles ? "pair" : "player"));
  return out;
}
/** Allowed but worth a look: uneven pools. */
export function poolWarnings(d: DrawDivision, mode: PoolAllocationMode = "snake"): string[] {
  const ps = poolsFor(d, mode);
  if (!ps || ps.length < 2) return [];
  const sz = ps.map((p) => p.length);
  return Math.max(...sz) - Math.min(...sz) > 1 ? [`Pools are uneven (${sz.join(" / ")}) — bigger pools play more games. Allowed, but check it is intended.`] : [];
}

/* ── validation + spec ── */

export function divisionIssues(d: DrawDivision): string[] {
  const n = d.units.length, f = d.format, out: string[] = [...(d.blockers ?? []), ...poolBlocks(d)];
  if (d.poolReview?.needsDecision && !d.poolAccepted) out.push(`pools are "Decide after entries close" — review the recommended pools and accept or adjust them`);
  if (f.kind === "cross" && d.poolReview && d.poolReview.mode !== "none" && (d.poolReview.needsDecision || d.poolReview.recommended.length > 1)) out.push(`pools are set for a group that plays between subcategories — pool-to-pool cross play isn't supported, so choose "No pools" for it in setup (SquashHub won't guess which pools meet)`);
  const u = d.doubles ? "pairs" : "players";
  if (n < (f.kind === "cross" ? 1 : 2)) out.push(`needs at least ${f.kind === "cross" ? 1 : 2} ${u} (has ${n})`);
  if (!f.kind) out.push("choose a format");
  if (f.kind === "pools" && !d.manualPools && (f.pools < 2 || Math.floor(n / f.pools) < 2)) out.push(`${f.pools} pools need at least ${f.pools * 2} ${u}`);
  if (f.kind === "swiss" && (f.swissRounds < 1 || f.swissRounds > n - 1)) out.push(`Swiss rounds must be 1–${Math.max(1, n - 1)}`);
  if (f.kind === "cross" && crossOpponents(d).length < 1) out.push(f.crossVs ? "choose at least one group for this group to play" : "cross-league needs this group and at least one other group to play against");
  if (!f.schedule.rule) out.push("choose play-by date or fixed date");
  if (f.schedule.rule === "play_by" && !f.schedule.deadlines.filter(Boolean).length) out.push("set the play-by date");
  if (f.schedule.rule === "play_by" && f.schedule.deadlines.some((x) => !x)) out.push("a play-by round has no date");
  if (f.schedule.rule === "play_by" && [...f.schedule.deadlines].sort().join() !== f.schedule.deadlines.join()) out.push("play-by dates must be in date order");
  if (f.schedule.rule === "fixed" && !f.schedule.dates[0]) out.push("set the match date");
  return out;
}

/** Groups this cross-league division plays: the chosen pairings, else every other group in its selected set. Never its own group. */
export function crossOpponents(d: DrawDivision): number[] {
  const f = d.format;
  const xs = f.crossVs ? f.crossVs : f.crossGroups.length >= 2 && f.crossGroups.includes(d.group) ? f.crossGroups : [];
  return [...new Set(xs)].filter((g) => g !== d.group).sort((a, b) => a - b);
}

/**
 * Cross-league sets = connected groups that play each other, with the exact group-vs-group meetings.
 * Pairings must be reciprocal; nothing beyond the configured meetings is inferred.
 */
export function crossSets(divs: DrawDivision[]): { sets: number[][]; meetings: Map<string, Array<[number, number]>>; errors: string[] } {
  const errors: string[] = [];
  const byGroup = new Map(divs.map((d) => [d.group, d]));
  const edges = new Map<string, [number, number]>();
  const parent = new Map<number, number>();
  const find = (x: number): number => { while (parent.get(x)! !== x) x = parent.get(x)!; return x; };
  for (const d of divs) if (d.format.kind === "cross") parent.set(d.group, d.group);
  for (const d of divs) {
    if (d.format.kind !== "cross") continue;
    for (const g of crossOpponents(d)) {
      const o = byGroup.get(g);
      if (!o) { errors.push(`${d.label}: cross-league group ${g} doesn't exist in this tournament.`); continue; }
      if (o.format.kind !== "cross") { errors.push(`${d.label}: plays cross-league against ${o.label}, but ${o.label} is set to a different format. Make both cross-league or remove ${o.label} from the pairing.`); continue; }
      if (!crossOpponents(o).includes(d.group)) { errors.push(`${d.label} is set to play ${o.label}, but ${o.label} isn't set to play ${d.label} — make the pairing match on both groups.`); continue; }
      if (JSON.stringify(o.format.schedule) !== JSON.stringify(d.format.schedule)) errors.push(`${d.label} and ${o.label} play each other but have different dates — give them the same schedule.`);
      if (o.doubles !== d.doubles) errors.push(`${d.label} and ${o.label} can't play each other: one is singles, the other doubles.`);
      const [x, y] = d.group < g ? [d.group, g] : [g, d.group];
      edges.set(`${x}-${y}`, [x, y]);
      parent.set(find(x), find(y));
    }
  }
  const comp = new Map<number, number[]>();
  for (const g of parent.keys()) { const r = find(g); comp.set(r, [...(comp.get(r) ?? []), g]); }
  const sets = [...comp.values()].map((s) => s.sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
  const meetings = new Map<string, Array<[number, number]>>();
  for (const set of sets) meetings.set(set.join(), [...edges.values()].filter(([x]) => set.includes(x)).sort((p, q) => p[0] - q[0] || p[1] - q[1]));
  return { sets, meetings, errors: [...new Set(errors)] };
}

/**
 * Cross-league matchups (the existing Club Champs rule: groups play OTHER groups, never within their own group).
 * `meetings` = exact group-index pairs that meet (default: every group meets every other). Meetings are spread over
 * meeting-rounds so no group plays two meetings at once; within a meeting, a circle schedule so nobody plays twice in
 * one round. Pool index = group order in the set, position = seed within the group.
 */
export function crossMatchups(sizes: number[], meetings?: Array<[number, number]>): Array<{ round: number; order: number; a: string; b: string; tie: string }> {
  const letter = (i: number) => String.fromCharCode(65 + i);
  let sched: Array<{ a: number; b: number; round: number }>;
  if (!meetings) sched = roundRobin(sizes.map((_, i) => String(i))).map((m) => ({ a: Number(m.a), b: Number(m.b), round: m.round }));
  else {
    const busy = new Map<number, Set<number>>();
    sched = meetings.map(([a, b]) => {
      let r = 1; while (busy.get(r)?.has(a) || busy.get(r)?.has(b)) r++;
      busy.set(r, new Set([...(busy.get(r) ?? []), a, b]));
      return { a, b, round: r };
    });
  }
  const k = Math.max(1, ...sizes);
  const out: Array<{ round: number; order: number; a: string; b: string; tie: string }> = [];
  const orderIn = new Map<number, number>();
  for (const m of sched) {
    const pa = m.a, pb = m.b;
    for (let r = 0; r < k; r++) for (let i = 0; i < k; i++) {
      const ia = i, ib = (i + r) % k;
      if (ia >= sizes[pa] || ib >= sizes[pb]) continue;
      const round = (m.round - 1) * k + r + 1;
      const o = (orderIn.get(round) ?? 0) + 1; orderIn.set(round, o);
      out.push({ round, order: o, a: `${letter(pa)}${ia + 1}`, b: `${letter(pb)}${ib + 1}`, tie: `${letter(pa)}v${letter(pb)}` });
    }
  }
  // Renumber rounds densely (meeting rounds where a pool sat out leave no gaps).
  const used = [...new Set(out.map((x) => x.round))].sort((a, b) => a - b);
  return out.map((x) => ({ ...x, round: used.indexOf(x.round) + 1 }));
}

/** Generic message when the structure needs more rounds than play-by dates were set. */
export function roundShortfall(rounds: number, dates: number): string {
  const more = rounds - dates;
  return `This matchup requires ${rounds} rounds, but only ${dates} play-by date${dates === 1 ? "" : "s"}/round${dates === 1 ? " is" : "s are"} configured. Add at least ${more} more, or tick "Let several rounds share a play-by date".`;
}

/** Engine round → play-by deadline. Several plan deadlines are spread over the rounds by `upto` (or an even split). */
export function roundDeadlines(s: DivSchedule, rounds: number): { dates: string[]; ranges: Array<{ deadline: string; from: number; to: number; proposed: boolean }>; error: string | null } {
  const ds = s.deadlines.filter(Boolean);
  if (!ds.length || rounds < 1) return { dates: [], ranges: [], error: null };
  if (ds.length > rounds) return { dates: [], ranges: [], error: `${ds.length} play-by dates but this structure only has ${rounds} round${rounds === 1 ? "" : "s"} — ${ds.length - rounds} date${ds.length - rounds === 1 ? " is" : "s are"} unused (${ds.slice(rounds).join(", ")}). Remove ${ds.length - rounds === 1 ? "it" : "them"} or change the format.` };
  if (ds.length > 1 && ds.length < rounds && !s.share) return { dates: [], ranges: [], error: roundShortfall(rounds, ds.length) };
  const ranges: Array<{ deadline: string; from: number; to: number; proposed: boolean }> = [];
  let from = 1;
  for (let k = 0; k < ds.length; k++) {
    const last = k === ds.length - 1;
    const given = last ? rounds : s.upto[k];
    const to = last ? rounds : given ?? Math.round((rounds * (k + 1)) / ds.length);
    if (to < from || to > rounds - (ds.length - 1 - k)) return { dates: [], ranges: [], error: `Play-by date ${ds[k]}: rounds must run ${from}–${rounds - (ds.length - 1 - k)}.` };
    ranges.push({ deadline: ds[k], from, to, proposed: !last && given == null && ds.length !== rounds });
    from = to + 1;
  }
  const dates: string[] = [];
  for (const r of ranges) for (let i = r.from; i <= r.to; i++) dates.push(r.deadline);
  return { dates, ranges, error: null };
}

type SpecOpts = { roundCounts?: Map<string, number>; poolMode?: PoolAllocationMode };
const lastDeadline = (s: DivSchedule) => s.deadlines.filter(Boolean).slice(-1)[0] ?? null;

function stageSchedule(s: DivSchedule, rounds: number | undefined) {
  if (s.rule === "play_by") {
    const rd = rounds && s.deadlines.filter(Boolean).length > 1 ? roundDeadlines(s, rounds).dates : [];
    return { rule: "play_by" as const, deadline: lastDeadline(s), roundDates: rd.length ? rd : undefined };
  }
  return { rule: "fixed" as const, date: s.dates[0] ?? null, roundDates: s.dates.length ? [...s.dates] : undefined };
}

export function buildDrawSpec(name: string, divs: DrawDivision[], version: string, opts: SpecOpts = {}): TournamentSpec {
  const mode = opts.poolMode ?? "snake";
  const { sets, meetings } = crossSets(divs);
  const byGroup = new Map(divs.map((d) => [d.group, d]));
  const done = new Set<number>();
  const out: TournamentSpec["divisions"] = [];
  for (const d of divs) {
    if (done.has(d.group)) continue;
    const f = d.format, n = d.units.length;
    if (f.kind === "cross") {
      const set = sets.find((s) => s.includes(d.group)) ?? [d.group];
      const members = set.map((g) => byGroup.get(g)!).filter(Boolean);
      members.forEach((m) => done.add(m.group));
      const id = `x${set.join("-")}`;
      const sizes = members.map((m) => m.units.length);
      const idx = (g: number) => set.indexOf(g);
      const mt = (meetings.get(set.join()) ?? []).map(([x, y]) => [idx(x), idx(y)] as [number, number]);
      const allMeet = mt.length === (set.length * (set.length - 1)) / 2;
      const matches = crossMatchups(sizes, allMeet ? undefined : mt);
      const slotIds = [...new Set(matches.flatMap((m) => [m.a, m.b]))];
      out.push({
        divisionId: id, label: allMeet ? members.map((m) => m.label).join(" v ") : (meetings.get(set.join()) ?? []).map(([x, y]) => `${byGroup.get(x)!.label} v ${byGroup.get(y)!.label}`).join("; "), unit: d.doubles ? "pairs" : "players",
        expectedEntrants: sizes.reduce((s, x) => s + x, 0),
        seeding: { source: "entry_order", method: "snake" }, placements: "champion", finalStandings: "last_stage", entrants: [],
        groupNumber: set[0], entryGroups: set, poolLabels: members.map((m) => m.label),
        ...playoffStagesFor({
          id: `${version}-main`, order: 0, kind: "mapped", name: "Cross-league round robin",
          discipline: d.doubles ? "doubles" : "singles",
          // One slot = one fixed competitive unit (a doubles pair is a single entrant, never split).
          mapping: {
            source: "seed_pools", sourceStageId: null, pools: set.length, poolSize: Math.max(1, ...sizes), discipline: "singles",
            units: slotIds.map((sid) => ({ id: sid, slots: [{ pool: sid.charCodeAt(0) - 65, position: Number(sid.slice(1)) }] })),
            matches, derived: true, positions: members.map((m) => m.units.map(unitId)),
          },
          schedule: stageSchedule(f.schedule, opts.roundCounts?.get(id)),
        } as any, version, d),
      } as any);
      continue;
    }
    done.add(d.group);
    const kind = f.kind!, id = `g${d.group}`;
    out.push({
      divisionId: id, label: d.label, unit: d.doubles ? "pairs" : "players", expectedEntrants: n, groupNumber: d.group,
      seeding: { source: "entry_order", method: f.seeding === "random" ? "random" : "snake" },
      placements: "champion", finalStandings: "last_stage", entrants: [],
      ...playoffStagesFor({
        id: `${version}-main`, order: 0, kind, name: kind === "knockout" ? "Knockout" : kind === "swiss" ? "Swiss rounds" : kind === "pools" ? "Pools" : "Round robin",
        pools: kind === "pools" ? f.pools : undefined,
        poolSize: kind === "pools" ? Math.max(1, ...(poolsFor(d, mode) ?? [[]]).map((p) => p.length)) : undefined,
        poolMembers: kind === "pools" || kind === "round_robin" ? poolsFor(d, mode) ?? undefined : undefined,
        swissRounds: kind === "swiss" ? f.swissRounds : undefined,
        drawSize: kind === "knockout" ? nextPow2(n) : undefined,
        discipline: d.doubles ? "doubles" : "singles",
        schedule: stageSchedule(f.schedule, opts.roundCounts?.get(id)),
      } as any, version, d),
    } as any);
  }
  return { version: 1, architecture: "structured", name, divisions: out };
}

/** Seeded entrants placed into the spec, as loadEntrants would (rank = seed order). */
export function withEntrants(spec: TournamentSpec, divs: DrawDivision[]): TournamentSpec {
  return {
    ...spec, divisions: spec.divisions.map((sd) => {
      const groups = sd.entryGroups?.length ? sd.entryGroups : [sd.groupNumber!];
      const units = groups.flatMap((g) => divs.find((d) => d.group === g)?.units ?? []);
      return { ...sd, entrants: units.map((u, k) => ({ id: unitId(u), rank: k + 1 })) };
    }),
  };
}

/** Final spec: a dry run counts each division's rounds so several play-by dates land on the right rounds. */
export function finalDrawSpec(name: string, divs: DrawDivision[], version: string, poolMode: PoolAllocationMode = "snake"): TournamentSpec {
  const first = buildDrawSpec(name, divs, version, { poolMode });
  const fx = generateFromSpec(withEntrants(first, divs), "preview");
  const roundCounts = new Map(first.divisions.map((sd) => [sd.divisionId, Math.max(0, ...fx.filter((f) => f.divisionId === sd.divisionId).map((f) => f.round ?? 1))]));
  return buildDrawSpec(name, divs, version, { roundCounts, poolMode });
}

export type DrawPreview = {
  /** Rounds the structure needs, per entry group (known as soon as the dry run works, even when dates block). */
  roundsByGroup: Record<number, number>;
  divisions: Array<{ groups: number[]; label: string; units: number; games: number; rounds: number; pools: number; byes: number; schedule: string; perRound: Array<{ round: number; games: number; date: string | null }> }>;
  total: number; errors: string[];
};

/** Dry run through the real engine generator — exactly what Generate will save. */
export function previewDraw(name: string, divs: DrawDivision[], window: { start: string | null; end: string | null }, version = "preview", poolMode: PoolAllocationMode = "snake"): DrawPreview {
  const errors = divs.flatMap((d) => divisionIssues(d).map((m) => `${d.label}: ${m}`));
  errors.push(...crossSets(divs).errors);
  const out: DrawPreview = { divisions: [], total: 0, errors, roundsByGroup: {} };
  if (errors.length) return out;
  try {
    const first = buildDrawSpec(name, divs, version, { poolMode });
    const fx0 = generateFromSpec(withEntrants(first, divs), "preview");
    for (const sd of first.divisions) {
      const rounds = Math.max(0, ...fx0.filter((f) => f.divisionId === sd.divisionId).map((f) => f.round ?? 1));
      const d = divs.find((x) => x.group === sd.groupNumber)!;
      for (const g of (sd as any).entryGroups ?? [sd.groupNumber]) out.roundsByGroup[g] = rounds;
      if (d.format.schedule.rule === "play_by") { const e = roundDeadlines(d.format.schedule, rounds).error; if (e) errors.push(`${sd.label}: ${e}`); }
    }
    if (errors.length) return out;
    const spec = withEntrants(finalDrawSpec(name, divs, version, poolMode), divs);
    errors.push(...specDateIssues(spec, window).filter((x) => x.level === "error").map((x) => x.message));
    if (errors.length) return out;
    const fx = generateFromSpec(spec, "preview");
    for (const sd of spec.divisions) {
      const mine = fx.filter((f) => f.divisionId === sd.divisionId);
      const real = mine.filter((f) => f.a && f.b);
      const d = divs.find((x) => x.group === sd.groupNumber)!;
      const f = d.format;
      const rounds = Math.max(0, ...mine.map((m) => m.round ?? 1));
      const sch: any = sd.stages[0].schedule;
      const dateOf = (r: number): string | null => sch.roundDates?.[r - 1] ?? (sch.rule === "play_by" ? sch.deadline : r === 1 ? sch.date : null);
      const rd = f.schedule.rule === "play_by" ? roundDeadlines(f.schedule, rounds) : null;
      out.divisions.push({
        groups: (sd as any).entryGroups ?? [sd.groupNumber], label: sd.label, units: sd.entrants.length, games: real.length, byes: mine.length - real.length, rounds,
        pools: f.kind === "pools" ? f.pools : f.kind === "cross" ? (sd.entryGroups?.length ?? 1) : 1,
        schedule: f.schedule.rule === "play_by"
          ? (rd && rd.ranges.length > 1 ? rd.ranges.map((x) => `${x.from === x.to ? `Round ${x.from}` : `Rounds ${x.from}–${x.to}`} play by ${x.deadline}${x.proposed ? " (proposed split)" : ""}`).join("; ") : `Play by ${lastDeadline(f.schedule)}`)
          : `Fixed: ${f.schedule.dates.join(", ")} (times & courts set later)`,
        perRound: Array.from({ length: rounds }, (_, i) => ({ round: i + 1, games: real.filter((m) => (m.round ?? 1) === i + 1).length, date: dateOf(i + 1) })),
      });
      out.total += real.length;
    }
  } catch (e: any) { errors.push(e.message); }
  return out;
}
