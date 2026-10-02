/**
 * Step-by-Step Beta → structured engine bridge for "Generate draw & fixtures".
 *
 * Pure helpers: turn CURRENT active registrations into competitive units (pairs never split),
 * propose a per-division format from the device-local Step plan, validate it, and build the
 * TournamentSpec the existing structured engine (engine-service / structured-persist) generates from.
 * Nothing here writes; persistence is `step_prepare_draw` + the engine's structured_commit.
 */
import { generateFromSpec, type TournamentSpec } from "@/lib/tournaments/engine-service";
import { nextPow2, roundRobin } from "@/lib/tournaments/contract";
import { distributeIntoPools, type PoolAllocationMode } from "@/lib/tournaments/pools";
import { specDateIssues } from "@/lib/tournaments/date-window";

export type DrawKind = "pools" | "round_robin" | "knockout" | "swiss" | "cross";
export type DrawSeeding = "entry_order" | "random" | "ladder" | "ranking";
/**
 * Schedule. play_by: one or more deadlines (sorted). With several, `upto[k]` = last engine round due by deadlines[k]
 * (null = proposed even split, shown in the preview); the last deadline covers the remaining rounds.
 */
export type DivSchedule = { rule: "play_by" | "fixed" | null; deadlines: string[]; upto: (number | null)[]; dates: string[] };
export type DivFormat = {
  kind: DrawKind | null;
  pools: number;
  swissRounds: number;
  seeding: DrawSeeding;
  schedule: DivSchedule;
  /** cross: every tournament group in this cross-league set (incl. its own). Each group plays every other group. */
  crossGroups: number[];
};
export type RegLite = { club_member_id: string; partner_member_id: string | null; status: string; division_choices: number[] | null };
export type DrawUnit = { member: string; partner: string | null };
export type DrawDivision = { group: number; label: string; doubles: boolean; units: DrawUnit[]; format: DivFormat; notes: string[]; playoffs: string[]; blockers?: string[];
  /** Organiser-adjusted pools (unit ids per pool). When set, this IS what Generate saves. */
  manualPools?: string[][] | null };

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
  try {
    const p = JSON.parse(localStorage.getItem(`sh.stepbuilder.${clubId}`) || "null");
    return p && p.createdTournamentId === tournamentId ? p : null;
  } catch { return null; }
}
/** "Mens › A 1st League · Doubles" → plan key "Mens::A 1st League". */
export const unitKeyOf = (label: string) => label.replace(/ · (Singles|Doubles|Singles and Doubles)$/i, "").split(" › ").join("::");

export function proposeFormat(plan: Plan | null, label: string): { format: DivFormat; notes: string[]; playoffs: string[]; crossKeys: string[] } {
  const key = unitKeyOf(label);
  const pick = <T,>(o: Record<string, T> | undefined, d: T): T => o?.[key] ?? o?.[key.split("::")[0]] ?? d;
  const notes: string[] = [];
  const f = pick(plan?.formatOverrides, plan?.format) ?? {};
  let kind: DrawKind | null = null;
  let crossKeys: string[] = [];
  if (f.kind === "pools") kind = Number(f.pools) > 1 ? "pools" : "round_robin";
  else if (f.kind === "knockout" || f.kind === "swiss") kind = f.kind;
  else if (f.kind === "cross") {
    kind = "cross";
    crossKeys = (f.crossUnits?.length ? f.crossUnits : [f.crossA, f.crossB]).filter(Boolean);
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
  const playoffs = kind && kind !== "knockout" && po.choice === "playoffs"
    ? (po.rounds === 1 ? ["Final"] : po.rounds === 2 ? ["Semi-final", "Final"] : ["Quarter-final", "Semi-final", "Final"]) : [];
  return { format: { kind, pools: Math.max(1, Number(f.pools) || 1), swissRounds: Math.max(0, Number(f.swissRounds) || 0), seeding, schedule, crossGroups: [] }, notes, playoffs, crossKeys };
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
  if (d.format.kind !== "pools" || !d.manualPools) return [];
  const out: string[] = [];
  const all = d.manualPools.flat(), ids = new Set(d.units.map(unitId));
  if (d.manualPools.length !== d.format.pools || all.length !== ids.size || all.some((x) => !ids.has(x))) out.push("your pool changes no longer match the entries or pool count — reset the pools");
  d.manualPools.forEach((p, i) => { if (p.length < 2) out.push(`Pool ${String.fromCharCode(65 + i)} has ${p.length} ${d.doubles ? "pair" : "player"}${p.length === 1 ? "" : "s"} — a pool needs at least 2`); });
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
  const u = d.doubles ? "pairs" : "players";
  if (n < (f.kind === "cross" ? 1 : 2)) out.push(`needs at least ${f.kind === "cross" ? 1 : 2} ${u} (has ${n})`);
  if (!f.kind) out.push("choose a format");
  if (f.kind === "pools" && !d.manualPools && (f.pools < 2 || Math.floor(n / f.pools) < 2)) out.push(`${f.pools} pools need at least ${f.pools * 2} ${u}`);
  if (f.kind === "swiss" && (f.swissRounds < 1 || f.swissRounds > n - 1)) out.push(`Swiss rounds must be 1–${Math.max(1, n - 1)}`);
  if (f.kind === "cross" && (f.crossGroups.length < 2 || !f.crossGroups.includes(d.group))) out.push("cross-league needs this group and at least one other group to play against");
  if (!f.schedule.rule) out.push("choose play-by date or fixed date");
  if (f.schedule.rule === "play_by" && !f.schedule.deadlines.filter(Boolean).length) out.push("set the play-by date");
  if (f.schedule.rule === "play_by" && f.schedule.deadlines.some((x) => !x)) out.push("a play-by round has no date");
  if (f.schedule.rule === "play_by" && [...f.schedule.deadlines].sort().join() !== f.schedule.deadlines.join()) out.push("play-by dates must be in date order");
  if (f.schedule.rule === "fixed" && !f.schedule.dates[0]) out.push("set the match date");
  return out;
}

/** Cross-league sets: divisions that play each other. Every listed group must also be cross with the same set and schedule. */
export function crossSets(divs: DrawDivision[]): { sets: number[][]; errors: string[] } {
  const errors: string[] = [];
  const byGroup = new Map(divs.map((d) => [d.group, d]));
  const sets: number[][] = [];
  const seen = new Set<string>();
  for (const d of divs) {
    if (d.format.kind !== "cross") continue;
    const set = [...new Set(d.format.crossGroups)].sort((a, b) => a - b);
    for (const g of set) {
      const o = byGroup.get(g);
      if (!o) { errors.push(`${d.label}: cross-league group ${g} doesn't exist in this tournament.`); continue; }
      if (o.format.kind !== "cross") errors.push(`${d.label}: plays cross-league against ${o.label}, but ${o.label} is set to a different format. Make both cross-league or remove ${o.label} from the set.`);
      else if ([...new Set(o.format.crossGroups)].sort((a, b) => a - b).join() !== set.join()) errors.push(`${d.label} and ${o.label} list different cross-league groups — they must play in the same set.`);
      else if (JSON.stringify(o.format.schedule) !== JSON.stringify(d.format.schedule)) errors.push(`${d.label} and ${o.label} play each other but have different dates — give them the same schedule.`);
      else if (o.doubles !== d.doubles) errors.push(`${d.label} and ${o.label} can't play each other: one is singles, the other doubles.`);
    }
    const k = set.join();
    if (!seen.has(k)) { seen.add(k); sets.push(set); }
  }
  return { sets, errors: [...new Set(errors)] };
}

/**
 * Cross-league matchups (the existing Club Champs rule: every selected group plays every other selected group,
 * never within its own group). Groups meet in a group rotation; within a meeting, a circle schedule so nobody plays
 * twice in one round. Pool index = group order in the set, position = seed within the group.
 */
export function crossMatchups(sizes: number[]): Array<{ round: number; order: number; a: string; b: string; tie: string }> {
  const letter = (i: number) => String.fromCharCode(65 + i);
  const meetings = roundRobin(sizes.map((_, i) => String(i)));
  const k = Math.max(1, ...sizes);
  const out: Array<{ round: number; order: number; a: string; b: string; tie: string }> = [];
  const orderIn = new Map<number, number>();
  for (const m of meetings) {
    const pa = Number(m.a), pb = Number(m.b);
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

/** Engine round → play-by deadline. Several plan deadlines are spread over the rounds by `upto` (or an even split). */
export function roundDeadlines(s: DivSchedule, rounds: number): { dates: string[]; ranges: Array<{ deadline: string; from: number; to: number; proposed: boolean }>; error: string | null } {
  const ds = s.deadlines.filter(Boolean);
  if (!ds.length || rounds < 1) return { dates: [], ranges: [], error: null };
  if (ds.length > rounds) return { dates: [], ranges: [], error: `${ds.length} play-by dates but only ${rounds} round${rounds === 1 ? "" : "s"} — remove a date or change the format.` };
  const ranges: Array<{ deadline: string; from: number; to: number; proposed: boolean }> = [];
  let from = 1;
  for (let k = 0; k < ds.length; k++) {
    const last = k === ds.length - 1;
    const given = last ? rounds : s.upto[k];
    const to = last ? rounds : given ?? Math.round((rounds * (k + 1)) / ds.length);
    if (to < from || to > rounds - (ds.length - 1 - k)) return { dates: [], ranges: [], error: `Play-by date ${ds[k]}: rounds must run ${from}–${rounds - (ds.length - 1 - k)}.` };
    ranges.push({ deadline: ds[k], from, to, proposed: !last && given == null });
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
  const { sets } = crossSets(divs);
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
      const matches = crossMatchups(sizes);
      const slotIds = [...new Set(matches.flatMap((m) => [m.a, m.b]))];
      out.push({
        divisionId: id, label: members.map((m) => m.label).join(" v "), unit: d.doubles ? "pairs" : "players",
        expectedEntrants: sizes.reduce((s, x) => s + x, 0),
        seeding: { source: "entry_order", method: "snake" }, placements: "champion", finalStandings: "last_stage", entrants: [],
        groupNumber: set[0], entryGroups: set, poolLabels: members.map((m) => m.label),
        stages: [{
          id: `${version}-main`, order: 0, kind: "mapped", name: "Cross-league round robin",
          discipline: d.doubles ? "doubles" : "singles",
          // One slot = one fixed competitive unit (a doubles pair is a single entrant, never split).
          mapping: {
            source: "seed_pools", sourceStageId: null, pools: set.length, poolSize: Math.max(1, ...sizes), discipline: "singles",
            units: slotIds.map((sid) => ({ id: sid, slots: [{ pool: sid.charCodeAt(0) - 65, position: Number(sid.slice(1)) }] })),
            matches, derived: true, positions: members.map((m) => m.units.map(unitId)),
          },
          schedule: stageSchedule(f.schedule, opts.roundCounts?.get(id)),
        }] as any,
        deferredStages: d.playoffs.map((p, i) => ({ stageKey: `${version}-po${i + 1}`, name: p, plannedDate: null })),
      } as any);
      continue;
    }
    done.add(d.group);
    const kind = f.kind!, id = `g${d.group}`;
    out.push({
      divisionId: id, label: d.label, unit: d.doubles ? "pairs" : "players", expectedEntrants: n, groupNumber: d.group,
      seeding: { source: "entry_order", method: f.seeding === "random" ? "random" : "snake" },
      placements: "champion", finalStandings: "last_stage", entrants: [],
      stages: [{
        id: `${version}-main`, order: 0, kind, name: kind === "knockout" ? "Knockout" : kind === "swiss" ? "Swiss rounds" : kind === "pools" ? "Pools" : "Round robin",
        pools: kind === "pools" ? f.pools : undefined,
        poolSize: kind === "pools" ? Math.max(1, ...(poolsFor(d, mode) ?? [[]]).map((p) => p.length)) : undefined,
        poolMembers: kind === "pools" || kind === "round_robin" ? poolsFor(d, mode) ?? undefined : undefined,
        swissRounds: kind === "swiss" ? f.swissRounds : undefined,
        drawSize: kind === "knockout" ? nextPow2(n) : undefined,
        discipline: d.doubles ? "doubles" : "singles",
        schedule: stageSchedule(f.schedule, opts.roundCounts?.get(id)),
      }],
      deferredStages: d.playoffs.map((p, i) => ({ stageKey: `${version}-po${i + 1}`, name: p, plannedDate: null })),
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
  divisions: Array<{ label: string; units: number; games: number; rounds: number; pools: number; byes: number; schedule: string; perRound: Array<{ round: number; games: number; date: string | null }> }>;
  total: number; errors: string[];
};

/** Dry run through the real engine generator — exactly what Generate will save. */
export function previewDraw(name: string, divs: DrawDivision[], window: { start: string | null; end: string | null }, version = "preview", poolMode: PoolAllocationMode = "snake"): DrawPreview {
  const errors = divs.flatMap((d) => divisionIssues(d).map((m) => `${d.label}: ${m}`));
  errors.push(...crossSets(divs).errors);
  const out: DrawPreview = { divisions: [], total: 0, errors };
  if (errors.length) return out;
  try {
    const first = buildDrawSpec(name, divs, version, { poolMode });
    const fx0 = generateFromSpec(withEntrants(first, divs), "preview");
    for (const sd of first.divisions) {
      const rounds = Math.max(0, ...fx0.filter((f) => f.divisionId === sd.divisionId).map((f) => f.round ?? 1));
      const d = divs.find((x) => x.group === sd.groupNumber)!;
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
        label: sd.label, units: sd.entrants.length, games: real.length, byes: mine.length - real.length, rounds,
        pools: f.kind === "pools" ? f.pools : f.kind === "cross" ? (sd.entryGroups?.length ?? 1) : 1,
        schedule: f.schedule.rule === "play_by"
          ? (rd && rd.ranges.length > 1 ? rd.ranges.map((x) => `rounds ${x.from}–${x.to} play by ${x.deadline}${x.proposed ? " (proposed split)" : ""}`).join("; ") : `Play by ${lastDeadline(f.schedule)}`)
          : `Fixed: ${f.schedule.dates.join(", ")} (times & courts set later)`,
        perRound: Array.from({ length: rounds }, (_, i) => ({ round: i + 1, games: real.filter((m) => (m.round ?? 1) === i + 1).length, date: dateOf(i + 1) })),
      });
      out.total += real.length;
    }
  } catch (e: any) { errors.push(e.message); }
  return out;
}
