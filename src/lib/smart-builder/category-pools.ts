import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";
import { rowStages, writeRowStages } from "./structure-rows";
import type { StagePlanItem } from "./stage-plan";

/** Default pool name inside one category for NEW setups: Pool 1, Pool 2 … (saved names always win). */
export const defaultPoolName = (i: number) => `Pool ${i + 1}`;

/** Pool names for a pooled stage, always one per pool, filling blanks with defaults. */
export function poolNamesFor(stage: Pick<StagePlanItem, "pools" | "poolNames"> | undefined, count = stage?.pools ?? 1): string[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => stage?.poolNames?.[i]?.trim() || defaultPoolName(i));
}

/** Expected players per pool: even split, earlier pools take the extra player (8 → 4/4, 9 → 5/4). */
export function poolPlayerSplit(players: number, pools: number): number[] {
  const p = Math.max(1, Math.floor(pools) || 1), n = Math.max(0, Math.floor(players) || 0);
  return Array.from({ length: p }, (_, i) => Math.floor(n / p) + (i < n % p ? 1 : 0));
}

/** One-line category summary, e.g. "2 pools · 8 players". */
export function poolSummary(players: number, pools: number, noun = "players"): string {
  return `${pools} pool${pools === 1 ? "" : "s"} · ${players} ${noun}`;
}

/** Rename one pool. Labels only: returns a new names array, never touching players/fixtures. Blank names keep the default. */
export function renamePool(names: string[] | undefined, count: number, index: number, name: string): string[] {
  const base = Array.from({ length: Math.max(1, count) }, (_, i) => names?.[i] ?? defaultPoolName(i));
  return base.map((n, i) => (i === index ? name : n));
}

/**
 * True when a category has been split into ≥2 round-robin subdivisions. Those are SEPARATE draws with
 * separate playoffs — usually the organiser meant pools inside one category.
 */
export function groupsLookLikePools(a: StepAnswers, cat: string): boolean {
  const subs = (a.subcats[cat] ?? []).map((s) => s.trim()).filter(Boolean);
  if (subs.length < 2) return false;
  return subs.every((s) => ["round_robin", "pools"].includes(rowStages(a, `${cat}::${s}`)[0]?.kind ?? ""));
}

/**
 * Setup-only conversion (no players placed yet): N round-robin subdivisions → ONE category with N pools
 * (Pool 1, Pool 2…), each pool keeping its own fixtures/standings, all feeding the same category playoffs.
 */
export function convertGroupsToPools(a: StepAnswers, cat: string): StepAnswers {
  if (!groupsLookLikePools(a, cat)) return a;
  const subs = (a.subcats[cat] ?? []).map((s) => s.trim()).filter(Boolean);
  const keys = subs.map((s) => `${cat}::${s}`);
  const base = rowStages(a, keys[0]);
  const first = base[0]!;
  const entries = keys.reduce((n, k) => n + (Number(a.unitEntries[k]) || 0), 0);
  const subcats = { ...a.subcats };
  delete subcats[cat];
  const disc = { ...a.disc }, unitEntries = { ...a.unitEntries };
  const sharedDisc = a.disc[keys[0]] ?? a.disc[cat];
  keys.forEach((k) => { delete disc[k]; delete unitEntries[k]; });
  if (sharedDisc) disc[cat] = sharedDisc;
  if (entries) unitEntries[cat] = String(entries);
  const next: StepAnswers = { ...a, subcats, disc, unitEntries };
  const pooled: StagePlanItem = { ...first, kind: "pools", pools: subs.length, poolNames: poolNamesFor(undefined, subs.length) };
  return writeRowStages(next, cat, [pooled, ...base.slice(1)]);
}
