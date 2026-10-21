import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";
import { rowStages, writeRowStages } from "./structure-rows";
import type { StagePlanItem } from "./stage-plan";

/** Default pool name inside one category: Pool A, Pool B … */
export const defaultPoolName = (i: number) => `Pool ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) + 1 : ""}`;

/** Pool names for a pooled stage, always one per pool, filling blanks with defaults. */
export function poolNamesFor(stage: Pick<StagePlanItem, "pools" | "poolNames"> | undefined, count = stage?.pools ?? 1): string[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => stage?.poolNames?.[i]?.trim() || defaultPoolName(i));
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
 * (Pool A, Pool B…), each pool keeping its own fixtures/standings, all feeding the same category playoffs.
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
