/**
 * Per-category stage plans for the Planned Format step.
 *
 * A category's plan is an ordered list of stages (Stage 1 → Stage 2 → …). Stage 1 inherits the tournament
 * starting default unless the category holds its own setting. Later stages may be left undecided.
 *
 * Rules (pure, no I/O):
 *  - Old answers without `stagePlans` still resolve: Stage 1 comes from format/formatOverrides
 *    (confirmed Swiss rounds win over estimates). Nothing is lost or rewritten on read.
 *  - Saving writes Stage 1 back to format/formatOverrides so existing draw/progression readers agree.
 *  - Active/completed status is DERIVED from generated games, never stored on the plan.
 *  - A generated stage's format is fixed; ending it early = set `endAfterRound` + add a new stage.
 *  - Impact preview is display-only: it lists what an approved apply WOULD touch. Played games are never
 *    listed for withdrawal, and court bookings are kept by default.
 *  - Recommendations are advisory and never stored as decisions.
 */

import type { RRTopology } from "./rr-topology";

export type StageKind = "swiss" | "round_robin" | "pools" | "knockout" | "monrad" | "placement" | "cross_league";
export const STAGE_KINDS: { kind: StageKind; label: string; rounds: boolean }[] = [
  { kind: "swiss", label: "Swiss", rounds: true },
  { kind: "round_robin", label: "Round robin", rounds: false },
  { kind: "pools", label: "Pools", rounds: false },
  { kind: "knockout", label: "Knockout", rounds: false },
  { kind: "monrad", label: "Monrad (positional draw)", rounds: false },
  { kind: "placement", label: "Positional playoff", rounds: false },
  { kind: "cross_league", label: "Cross-league", rounds: false },
];
export const stageKindLabel = (k?: string | null) => STAGE_KINDS.find((s) => s.kind === k)?.label ?? (k ? k.replace(/_/g, " ") : "Undecided");

export type AdvanceMode = "all_continue" | "top_n" | "per_pool" | "shared_playoff" | "none";
export interface StageAdvance { mode: AdvanceMode; topN?: number | null; perPool?: number | null }

export interface StagePlanItem {
  id: string;
  /** null = undecided future stage. */
  kind: StageKind | null;
  rounds?: number | null;
  /** Stop this stage after round N (mid-tournament early finish). */
  endAfterRound?: number | null;
  pools?: number | null;
  /** Optional display names for planned pools; indexes and topology remain unchanged. */
  poolNames?: string[];
  /** How seeds are dealt into pools: snake = even pools, banded = strength bands (Pool A strongest). */
  poolAllocation?: "snake" | "banded";
  /** Riverside row-planning only; mapped-stage apply requires separate review. */
  rrTopology?: RRTopology;
  advance?: StageAdvance;
  /** Parent category key when this stage is a playoff shared by sibling subcategories (e.g. Men's A1/A2). */
  sharedWith?: string | null;
}

export type StagePlans = Record<string, StagePlanItem[]>;

interface FormatLikeIn { kind?: string | null; swissRounds?: string | number | null; swissRoundsConfirmed?: string | number | null; pools?: string | number | null }
export interface PlanAnswers { format?: FormatLikeIn; formatOverrides?: Record<string, FormatLikeIn>; stagePlans?: StagePlans }

export type StageSource = "default" | "category" | "override" | "unset";

const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null; };
const KNOWN = new Set(STAGE_KINDS.map((s) => s.kind));
const toKind = (k?: string | null): StageKind | null => (k && KNOWN.has(k as StageKind) ? (k as StageKind) : null);
let seq = 0;
export const newStageId = () => `st_${Date.now().toString(36)}_${(seq++).toString(36)}`;

function fromFormat(f: FormatLikeIn | undefined, id = "s1"): StagePlanItem {
  const kind = toKind(f?.kind ?? null);
  return { id, kind, rounds: kind === "swiss" ? num(f?.swissRoundsConfirmed) ?? num(f?.swissRounds) : null, pools: kind === "pools" ? num(f?.pools) : null, advance: { mode: "all_continue" } };
}

/** Effective stage sequence for one category/subcategory key, with where Stage 1 came from. */
export function resolveStagePlan(a: PlanAnswers, key: string): { stages: StagePlanItem[]; source: StageSource } {
  const own = a.stagePlans?.[key];
  const parent = key.includes("::") ? a.stagePlans?.[key.split("::")[0]] : undefined;
  const fo = a.formatOverrides?.[key] ? "override" : key.includes("::") && a.formatOverrides?.[key.split("::")[0]] ? "category" : null;
  if (own?.length) return { stages: own, source: fo ?? "override" };
  if (parent?.length) return { stages: parent, source: "category" };
  const f = a.formatOverrides?.[key] ?? (key.includes("::") ? a.formatOverrides?.[key.split("::")[0]] : undefined) ?? a.format;
  const s1 = fromFormat(f);
  return { stages: [s1], source: fo ?? (a.format?.kind ? "default" : "unset") };
}

/** Rounds actually planned for a stage (early finish wins). */
export const stageRounds = (s: StagePlanItem) => s.endAfterRound ?? s.rounds ?? null;

/** Write a category plan + keep legacy format/formatOverrides in step (Stage 1 only). Equal-to-default → inherit. */
export function setCategoryStagePlan<A extends PlanAnswers>(a: A, key: string, stages: StagePlanItem[]): A {
  const plans = { ...(a.stagePlans ?? {}), [key]: stages };
  const s1 = stages[0];
  const fo = { ...(a.formatOverrides ?? {}) } as Record<string, FormatLikeIn>;
  if (s1?.kind) {
    const r = stageRounds(s1);
    const patch: FormatLikeIn = { ...(fo[key] ?? {}), kind: s1.kind, ...(s1.kind === "swiss" && r ? { swissRounds: String(r), swissRoundsConfirmed: String(r) } : {}), ...(s1.kind === "pools" && s1.pools ? { pools: String(s1.pools) } : {}) };
    const d = a.format ?? {};
    const same = d.kind === patch.kind && (patch.kind !== "swiss" || String(num(d.swissRoundsConfirmed) ?? num(d.swissRounds) ?? "") === String(patch.swissRounds ?? "")) && (patch.kind !== "pools" || String(d.pools ?? "") === String(patch.pools ?? ""));
    if (same && !fo[key]) { /* inherits the default: no redundant override */ } else fo[key] = patch;
  }
  return { ...a, stagePlans: plans, formatOverrides: fo };
}

/** Starting default for every category's Stage 1 (keeps legacy `format` in step). */
export function setStartingDefault<A extends PlanAnswers>(a: A, kind: StageKind | null, rounds?: number | null): A {
  const f: FormatLikeIn = { ...(a.format ?? {}), kind };
  if (kind === "swiss") { f.swissRounds = rounds ? String(rounds) : ""; f.swissRoundsConfirmed = rounds ? String(rounds) : ""; }
  return { ...a, format: f };
}

// ---------- Status (derived) ----------
export interface StageGameRow { stageIndex: number; round: number | null; decided: boolean }
export type StageStatus = { state: "planned" | "active" | "completed"; currentRound: number | null; playedRounds: number };

/** Status from generated games for one category. Games are assigned to plan stages by order (stageIndex). */
export function deriveStageStatus(stage: StagePlanItem, index: number, games: StageGameRow[]): StageStatus {
  const mine = games.filter((g) => g.stageIndex === index);
  if (!mine.length) return { state: "planned", currentRound: null, playedRounds: 0 };
  const rounds = [...new Set(mine.map((g) => g.round ?? 1))].sort((x, y) => x - y);
  const done = rounds.filter((r) => mine.filter((g) => (g.round ?? 1) === r).every((g) => g.decided));
  const playedRounds = done.length ? Math.max(...done) : 0;
  const target = stageRounds(stage);
  const allDone = mine.every((g) => g.decided) && (target == null || playedRounds >= target || stage.kind !== "swiss");
  if (allDone) return { state: "completed", currentRound: null, playedRounds };
  const current = rounds.find((r) => !done.includes(r)) ?? playedRounds + 1;
  return { state: "active", currentRound: current, playedRounds };
}

// ---------- Validation ----------
export interface PlanIssue { level: "error" | "warning"; stageId?: string; message: string }

export function validateStagePlan(stages: StagePlanItem[], ctx: { entrants?: number | null; generated?: { index: number; kind: string | null; maxPlayedRound: number; maxGeneratedRound: number }[] } = {}): PlanIssue[] {
  const out: PlanIssue[] = [];
  if (!stages.length) out.push({ level: "error", message: "Add at least one stage." });
  stages.forEach((s, i) => {
    const name = `Stage ${i + 1}`;
    const gen = ctx.generated?.find((g) => g.index === i);
    if (gen && gen.kind && s.kind !== gen.kind) out.push({ level: "error", stageId: s.id, message: `${name} has already been drawn as ${stageKindLabel(gen.kind)} — its format can't change. End it early and add a new stage instead.` });
    if (s.kind === "swiss" && !s.rounds) out.push({ level: "error", stageId: s.id, message: `${name}: set the number of Swiss rounds.` });
    if (s.endAfterRound != null) {
      if (s.rounds && s.endAfterRound > s.rounds) out.push({ level: "error", stageId: s.id, message: `${name}: can't end after round ${s.endAfterRound} — only ${s.rounds} rounds planned.` });
      if (gen && s.endAfterRound < gen.maxPlayedRound) out.push({ level: "error", stageId: s.id, message: `${name}: round ${gen.maxPlayedRound} has already been played, so it can't end after round ${s.endAfterRound}.` });
    }
    if (s.kind === "swiss" && ctx.entrants && s.rounds && s.rounds >= ctx.entrants) out.push({ level: "warning", stageId: s.id, message: `${name}: ${s.rounds} Swiss rounds for ${ctx.entrants} entrants means repeat meetings.` });
    const prev = stages[i - 1];
    if (prev && (prev.kind === "knockout") && s.kind && prev.advance?.mode !== "top_n" && prev.advance?.mode !== "shared_playoff") out.push({ level: "error", stageId: s.id, message: `${name}: a knockout eliminates players — set how many qualify from Stage ${i}.` });
    if (prev && prev.advance?.mode === "top_n" && prev.advance.topN && ctx.entrants && prev.advance.topN > ctx.entrants) out.push({ level: "error", stageId: s.id, message: `Stage ${i}: ${prev.advance.topN} qualifiers but only ${ctx.entrants} entrants.` });
    if (!s.kind && i === 0) out.push({ level: "error", stageId: s.id, message: "Stage 1 needs a format (or a tournament starting default)." });
  });
  return out;
}

// ---------- Impact preview (display only) ----------
export interface ImpactFixture { id: string; stageIndex: number; round: number | null; decided: boolean; hasBooking: boolean; scheduled: boolean }
export interface PlanImpact {
  withdraw: ImpactFixture[]; // unplayed games that an approved apply would withdraw
  keepBookings: number; // bookings on those games — kept by default
  drawLater: string[]; // stages that will be drawn from standings later
  protectedPlayed: number; // played games always preserved
  changed: boolean;
}

export function planImpact(before: StagePlanItem[], after: StagePlanItem[], fixtures: ImpactFixture[]): PlanImpact {
  const withdraw: ImpactFixture[] = [];
  after.forEach((s, i) => {
    const old = before[i];
    const end = stageRounds(s);
    const removed = !s.kind && old?.kind;
    fixtures.filter((f) => f.stageIndex === i && !f.decided).forEach((f) => {
      if (removed || (end != null && (f.round ?? 1) > end) || (old?.kind && s.kind && old.kind !== s.kind)) withdraw.push(f);
    });
  });
  fixtures.filter((f) => f.stageIndex >= after.length && !f.decided).forEach((f) => withdraw.push(f));
  const drawLater = after.map((s, i) => ({ s, i })).filter(({ s, i }) => i > 0 && s.kind && !fixtures.some((f) => f.stageIndex === i)).map(({ s, i }) => `Stage ${i + 1} (${stageKindLabel(s.kind)}) will be drawn from standings when Stage ${i} finishes.`);
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  return { withdraw, keepBookings: withdraw.filter((f) => f.hasBooking).length, drawLater, protectedPlayed: fixtures.filter((f) => f.decided).length, changed };
}

/** Advisory Swiss round recommendation (never stored as a decision). */
export function recommendSwissRounds(entrants: number | null | undefined): string | null {
  if (!entrants || entrants < 3) return null;
  const lo = Math.ceil(Math.log2(entrants));
  const hi = Math.min(entrants - 1, lo + 1);
  return lo === hi ? `${lo} rounds` : `${lo}–${hi} rounds`;
}
