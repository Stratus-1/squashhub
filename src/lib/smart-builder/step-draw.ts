/**
 * Step-by-Step Beta → structured engine bridge for "Generate draw & fixtures".
 *
 * Pure helpers: turn CURRENT active registrations into competitive units (pairs never split),
 * propose a per-division format from the device-local Step plan, validate it, and build the
 * TournamentSpec the existing structured engine (engine-service / structured-persist) generates from.
 * Nothing here writes; persistence is `step_prepare_draw` + the engine's structured_commit.
 */
import { generateFromSpec, type TournamentSpec } from "@/lib/tournaments/engine-service";
import { nextPow2 } from "@/lib/tournaments/contract";
import { specDateIssues } from "@/lib/tournaments/date-window";

export type DrawKind = "pools" | "round_robin" | "knockout" | "swiss";
export type DrawSeeding = "entry_order" | "random" | "ladder";
export type DivFormat = {
  kind: DrawKind | null;
  pools: number;
  swissRounds: number;
  seeding: DrawSeeding;
  schedule: { rule: "play_by" | "fixed" | null; deadline: string; dates: string[] };
};
export type RegLite = { club_member_id: string; partner_member_id: string | null; status: string; division_choices: number[] | null };
export type DrawUnit = { member: string; partner: string | null };
export type DrawDivision = { group: number; label: string; doubles: boolean; units: DrawUnit[]; format: DivFormat; notes: string[]; playoffs: string[] };

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
export function orderUnits(units: DrawUnit[], seeding: DrawSeeding, opts: { seed: number; ladder?: Map<string, number | null> }): DrawUnit[] {
  if (seeding === "random") return shuffle(units, opts.seed);
  if (seeding === "ladder") {
    const pos = (u: DrawUnit) => Math.min(...[u.member, u.partner].filter(Boolean).map((id) => opts.ladder?.get(id!) ?? Infinity));
    return [...units].map((u, i) => ({ u, i })).sort((x, y) => pos(x.u) - pos(y.u) || x.i - y.i).map((x) => x.u);
  }
  return units;
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

export function proposeFormat(plan: Plan | null, label: string): { format: DivFormat; notes: string[]; playoffs: string[] } {
  const key = unitKeyOf(label);
  const pick = <T,>(o: Record<string, T> | undefined, d: T): T => o?.[key] ?? o?.[key.split("::")[0]] ?? d;
  const notes: string[] = [];
  const f = pick(plan?.formatOverrides, plan?.format) ?? {};
  let kind: DrawKind | null = null;
  if (f.kind === "pools") kind = Number(f.pools) > 1 ? "pools" : "round_robin";
  else if (f.kind === "knockout" || f.kind === "swiss") kind = f.kind;
  else if (f.kind === "cross") notes.push("Planned as a cross-league round robin — that can't be generated safely yet; choose a format for this category.");
  else notes.push(plan ? "Format was left as \"Decide later\" — choose it now." : "The setup answers aren't on this device — choose the format.");
  const sd = pick<string | null>(plan?.seedingOverrides, plan?.seeding ?? null);
  const seeding: DrawSeeding = sd === "random" ? "random" : sd === "ladder" ? "ladder" : "entry_order";
  if (sd === "ranking" || sd === "manual") notes.push(`Seeding "${sd === "ranking" ? "Use rankings" : "Manual seeds"}" can't be applied automatically yet — entry order is used unless you change it.`);
  // Schedule: Club Champs main stages for this unit (or all units), else once-off days.
  const stages: any[] = (plan?.stages ?? []).filter((s: any) => (s.phase ?? "main") === "main" && (!s.unit || s.unit === key || s.unit === key.split("::")[0]));
  let schedule: DivFormat["schedule"] = { rule: null, deadline: "", dates: [] };
  if (stages.length && stages.every((s) => s.mode === "play_by" && s.deadline)) {
    const ds = stages.map((s) => s.deadline).sort();
    schedule = { rule: "play_by", deadline: ds[ds.length - 1], dates: [] };
    if (ds.length > 1) notes.push(`Your plan has ${ds.length} play-by rounds; the engine uses one play-by date per stage, so the last one (${ds[ds.length - 1]}) is applied to every game.`);
  } else if (stages.length && stages.every((s) => s.mode === "scheduled" && s.date)) {
    schedule = { rule: "fixed", deadline: "", dates: stages.map((s) => s.date).sort() };
    notes.push("Scheduled rounds get their date; court times and courts are not invented — book them separately.");
  } else if (!stages.length && plan?.days?.length) {
    schedule = { rule: "fixed", deadline: "", dates: [...new Set<string>(plan.days.map((d: any) => d.date).filter(Boolean))].sort() };
  } else if (stages.length) notes.push("Some stages are still \"Decide later\" — choose play-by or fixed dates now.");
  const po = pick(plan?.playoffOverrides, plan?.playoff) ?? {};
  const playoffs = kind && kind !== "knockout" && po.choice === "playoffs"
    ? (po.rounds === 1 ? ["Final"] : po.rounds === 2 ? ["Semi-final", "Final"] : ["Quarter-final", "Semi-final", "Final"]) : [];
  return { format: { kind, pools: Math.max(1, Number(f.pools) || 1), swissRounds: Math.max(0, Number(f.swissRounds) || 0), seeding, schedule }, notes, playoffs };
}

/* ── validation + spec ── */

export function divisionIssues(d: DrawDivision): string[] {
  const n = d.units.length, f = d.format, out: string[] = [];
  const u = d.doubles ? "pairs" : "players";
  if (n < 2) out.push(`needs at least 2 ${u} (has ${n})`);
  if (!f.kind) out.push("choose a format");
  if (f.kind === "pools" && (f.pools < 2 || Math.floor(n / f.pools) < 2)) out.push(`${f.pools} pools need at least ${f.pools * 2} ${u}`);
  if (f.kind === "swiss" && (f.swissRounds < 1 || f.swissRounds > n - 1)) out.push(`Swiss rounds must be 1–${Math.max(1, n - 1)}`);
  if (!f.schedule.rule) out.push("choose play-by date or fixed date");
  if (f.schedule.rule === "play_by" && !f.schedule.deadline) out.push("set the play-by date");
  if (f.schedule.rule === "fixed" && !f.schedule.dates[0]) out.push("set the match date");
  return out;
}

export function buildDrawSpec(name: string, divs: DrawDivision[], version: string): TournamentSpec {
  return {
    version: 1, architecture: "structured", name,
    divisions: divs.map((d) => {
      const f = d.format, n = d.units.length, kind = f.kind!;
      return {
        divisionId: `g${d.group}`, label: d.label, unit: d.doubles ? "pairs" : "players", expectedEntrants: n,
        seeding: { source: "entry_order", method: f.seeding === "random" ? "random" : "snake" },
        placements: "champion", finalStandings: "last_stage", entrants: [],
        stages: [{
          id: `${version}-main`, order: 0, kind, name: kind === "knockout" ? "Knockout" : kind === "swiss" ? "Swiss rounds" : kind === "pools" ? "Pools" : "Round robin",
          pools: kind === "pools" ? f.pools : undefined,
          poolSize: kind === "pools" ? Math.ceil(n / f.pools) : undefined,
          swissRounds: kind === "swiss" ? f.swissRounds : undefined,
          drawSize: kind === "knockout" ? nextPow2(n) : undefined,
          discipline: d.doubles ? "doubles" : "singles",
          schedule: f.schedule.rule === "play_by"
            ? { rule: "play_by", deadline: f.schedule.deadline }
            : { rule: "fixed", date: f.schedule.dates[0] ?? null, roundDates: f.schedule.dates.length ? [...f.schedule.dates] : undefined },
        }],
        deferredStages: d.playoffs.map((p, i) => ({ stageKey: `${version}-po${i + 1}`, name: p, plannedDate: null })),
      };
    }),
  };
}

/** Seeded entrants placed into the spec, as loadEntrants would (rank = seed order). */
export function withEntrants(spec: TournamentSpec, divs: DrawDivision[]): TournamentSpec {
  return { ...spec, divisions: spec.divisions.map((sd, i) => ({ ...sd, entrants: divs[i].units.map((u, k) => ({ id: unitId(u), rank: k + 1 })) })) };
}

export type DrawPreview = { divisions: Array<{ label: string; units: number; games: number; rounds: number; pools: number; byes: number; schedule: string }>; total: number; errors: string[] };

/** Dry run through the real engine generator — exactly what Generate will save. */
export function previewDraw(name: string, divs: DrawDivision[], window: { start: string | null; end: string | null }, version = "preview"): DrawPreview {
  const errors = divs.flatMap((d) => divisionIssues(d).map((m) => `${d.label}: ${m}`));
  const out: DrawPreview = { divisions: [], total: 0, errors };
  if (errors.length) return out;
  const spec = withEntrants(buildDrawSpec(name, divs, version), divs);
  errors.push(...specDateIssues(spec, window).filter((x) => x.level === "error").map((x) => x.message));
  if (errors.length) return out;
  try {
    const fx = generateFromSpec(spec, "preview");
    spec.divisions.forEach((sd, i) => {
      const mine = fx.filter((f) => f.divisionId === sd.divisionId);
      const real = mine.filter((f) => f.a && f.b);
      const f = divs[i].format;
      out.divisions.push({
        label: sd.label, units: divs[i].units.length, games: real.length, byes: mine.length - real.length,
        rounds: Math.max(0, ...mine.map((m) => m.round ?? 1)), pools: f.kind === "pools" ? f.pools : 1,
        schedule: f.schedule.rule === "play_by" ? `Play by ${f.schedule.deadline}` : `Fixed: ${f.schedule.dates.join(", ")} (times & courts set later)`,
      });
      out.total += real.length;
    });
  } catch (e: any) { errors.push(e.message); }
  return out;
}
