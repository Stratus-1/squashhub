import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";
import { newStageId, resolveStagePlan, setCategoryStagePlan, type StagePlanItem } from "./stage-plan";
import { placesOf } from "./pick-entries";
import { rrSizes } from "./rr-topology";
import { inferCategory, type CompetitionCategory } from "@/lib/leagues/category";

export const STRUCTURE_ELIGIBILITY_LABELS: Record<CompetitionCategory, string> = {
  open: "Open", mens: "Men only", ladies: "Ladies only", mixed: "Mixed",
};

/** Explicit gender eligibility is independent of names; subdivisions inherit it. */
export function structureEligibility(a: StepAnswers, key: string): CompetitionCategory | null {
  const parent = key.split("::")[0];
  return a.categoryTypes?.[parent]
    ?? Object.entries(a.categoryTypes ?? {}).find(([k]) => k.trim().toLowerCase() === parent.trim().toLowerCase())?.[1]
    ?? null;
}

export function structureEligibilityAdvisory(a: StepAnswers, key: string): string | null {
  const eligibility = structureEligibility(a, key);
  const inferred = inferCategory(key.split("::")[0]);
  return eligibility && inferred && eligibility !== inferred
    ? `Name suggests ${STRUCTURE_ELIGIBILITY_LABELS[inferred]}; eligibility is ${STRUCTURE_ELIGIBILITY_LABELS[eligibility]}. Your selection applies.` : null;
}

/** Presets prefill missing eligibility only, never replace an explicit selection. */
export function applyStructurePreset(a: StepAnswers, cat: string, name: string): StepAnswers {
  const p = DIVISION_PRESETS.find((x) => x.name === name);
  if (!p || p.name !== cat && a.categories.includes(p.name)) return a;
  const eligibility = structureEligibility(a, cat) ?? p.type;
  const next = renameStructureKey(a, cat, p.name);
  const keys = [p.name, ...(next.subcats[p.name] ?? []).map((s) => `${p.name}::${s}`)];
  return { ...next, categoryTypes: { ...next.categoryTypes, [p.name]: eligibility }, disc: { ...next.disc, ...Object.fromEntries(keys.map((k) => [k, p.discipline])) } };
}

export const DIVISION_PRESETS = [
  { name: "Men's Singles", type: "mens", discipline: "singles" },
  { name: "Ladies Singles", type: "ladies", discipline: "singles" },
  { name: "Men's Doubles", type: "mens", discipline: "doubles" },
  { name: "Ladies Doubles", type: "ladies", discipline: "doubles" },
  { name: "Mixed Doubles", type: "mixed", discipline: "doubles" },
  { name: "Open", type: "open", discipline: "singles" },
] as const;

export const STRUCTURE_HELP = {
  round_robin: "Within: everyone plays everyone else in the same group. Between: everyone plays everyone in selected other groups. Custom: only the group meetings you select, with optional within-group play.",
  pools: "Pools assign entrants to groups. Who plays whom is a separate stage choice; qualification and later playoffs are configured separately.",
  swiss: "Entrants typically play a specified number of rounds. After initial pairing, opponents have similar current results; this is not single elimination. Fixed-position Swiss uses the club's configured positional pairing rules.",
  knockout: "Losing eliminates an entrant from the title bracket, unless a consolation or positional draw is configured.",
  playoffs: "Qualifying stages: quarterfinals, semifinals and final, or a custom sequence. Qualification and pairings must be confirmed separately.",
};

export const structureUnits = (a: StepAnswers) => a.categories.filter(Boolean).flatMap((cat) => {
  const subs = a.subcats[cat]?.filter(Boolean) ?? [];
  return subs.length ? subs.map((s) => `${cat}::${s}`) : [cat];
});

export function rowStages(a: StepAnswers, key: string): StagePlanItem[] {
  return resolveStagePlan(a, key).stages;
}

/** Stage semantics stay explicit; legacy RR intent remains `pools` for existing readers. */
export function writeRowStages(a: StepAnswers, key: string, stages: StagePlanItem[]): StepAnswers {
  const next = setCategoryStagePlan(a, key, stages);
  const first = stages[0];
  const old = a.formatOverrides[key] ?? a.formatOverrides[key.split("::")[0]] ?? a.format;
  const kind = first?.kind === "round_robin" ? "pools" : first?.kind === "cross_league" ? "cross" : first?.kind ?? "later";
  return { ...next, formatOverrides: { ...next.formatOverrides, [key]: { ...old, kind: kind as StepAnswers["format"]["kind"], pools: String(first?.pools ?? 1), swissRounds: first?.kind === "swiss" ? String(first.rounds ?? "") : "", swissRoundsConfirmed: first?.kind === "swiss" ? String(first.endAfterRound ?? first.rounds ?? "") : "" } } };
}

const unitMaps = ["disc", "unitEntries", "scoringOverrides", "formatOverrides", "stagePlans", "poolPlan", "playoffPoolQualifiers", "playoffOverrides", "seedingOverrides", "elig", "partner", "pairs", "serving", "seedOrder", "split"] as const;

/** Rename keys atomically, including entrant references; no live I/O. */
export function renameStructureKey(a: StepAnswers, old: string, name: string): StepAnswers {
  const nextName = name.trim();
  if (!nextName || nextName.includes("::") || nextName === old) return a;
  const isSub = old.includes("::");
  const parent = old.split("::")[0];
  const dest = isSub ? `${parent}::${nextName}` : nextName;
  if (isSub ? (a.subcats[parent] ?? []).includes(nextName) : a.categories.includes(nextName)) return a;
  const remap = (k: string) => k === old ? dest : k.startsWith(`${old}::`) ? `${dest}${k.slice(old.length)}` : k;
  const copy = structuredClone(a);
  for (const field of unitMaps) {
    const map = copy[field];
    if (map) (copy as any)[field] = Object.fromEntries(Object.entries(map).map(([k, v]) => [remap(k), v]));
  }
  copy.categories = a.categories.map((c) => remap(c));
  copy.subcats = Object.fromEntries(Object.entries(a.subcats).map(([c, s]) => [remap(c), isSub && c === parent ? s.map((x) => x === old.split("::")[1] ? nextName : x) : s]));
  copy.categoryTypes = Object.fromEntries(Object.entries(a.categoryTypes ?? {}).map(([k, v]) => [remap(k), v]));
  copy.picks = Object.fromEntries(Object.keys(a.picks).map((id) => [id, placesOf(a.picks, id).map(remap)]));
  copy.courtRules = a.courtRules?.map((r) => ({ ...r, key: remap(r.key) }));
  for (const stages of Object.values(copy.stagePlans ?? {})) for (const s of stages) if (s.sharedWith) s.sharedWith = remap(s.sharedWith);
  if (copy.guide?.expected) copy.guide.expected = Object.fromEntries(Object.entries(copy.guide.expected).map(([k, v]) => [remap(k), v]));
  return copy;
}

/** Copy configuration only: never copy players, pair identities, fixtures or results. */
export function duplicateStructureRow(a: StepAnswers, cat: string): StepAnswers {
  let name = `${cat} copy`, i = 2;
  while (a.categories.includes(name)) name = `${cat} copy ${i++}`;
  let next: StepAnswers = { ...a, categories: [...a.categories, name], subcats: { ...a.subcats, [name]: [...(a.subcats[cat] ?? [])] }, categoryTypes: { ...a.categoryTypes, [name]: a.categoryTypes?.[cat] ?? "open" } };
  for (const field of unitMaps.filter((f) => !["pairs", "seedOrder"].includes(f))) {
    const src = a[field];
    if (src) (next as any)[field] = { ...src, ...Object.fromEntries(Object.entries(src).filter(([k]) => k === cat || k.startsWith(`${cat}::`)).map(([k, v]) => [k.replace(cat, name), structuredClone(v)])) };
  }
  for (const key of [name, ...(next.subcats[name] ?? []).map((s) => `${name}::${s}`)]) {
    const sourceKey = key.replace(name, cat);
    next = writeRowStages(next, key, rowStages(a, sourceKey).map((s) => ({ ...structuredClone(s), id: newStageId(), sharedWith: s.sharedWith === cat ? name : s.sharedWith })));
  }
  return next;
}

export function structureRowIssues(a: StepAnswers): string[] {
  const issues: string[] = [];
  if (!a.categories.length) issues.push("Add a division.");
  if (a.categories.some((c) => !c.trim() || c.includes("::"))) issues.push("Each division needs a name without ::.");
  if (new Set(a.categories.map((c) => c.trim().toLowerCase())).size !== a.categories.length) issues.push("Division names must be unique.");
  for (const cat of a.categories) {
    const subs = a.subcats[cat] ?? [];
    if (subs.some((s) => !s.trim() || s.includes("::")) || new Set(subs.map((s) => s.toLowerCase())).size !== subs.length) issues.push(`${cat}: use unique, non-empty subdivision names.`);
  }
  for (const key of structureUnits(a)) {
    if (!structureEligibility(a, key)) issues.push(`${key}: choose eligibility.`);
    if (!(a.disc[key] ?? a.disc[key.split("::")[0]] ?? (a.playType !== "both" ? a.playType : null))) issues.push(`${key}: choose singles or doubles.`);
    const n = Number(a.unitEntries[key]);
    if (!Number.isInteger(n) || n < 2) issues.push(`${key}: enter at least 2 expected entries.`);
    const first = rowStages(a, key)[0];
    if (first?.kind === "pools" && (!first.pools || first.pools < 1 || !Number.isInteger(first.pools) || first.pools > Math.floor(n / 2))) issues.push(`${key}: pools need at least 2 entrants each.`);
  }
  return issues;
}

export function poolSizesFor(a: StepAnswers, key: string, stage: StagePlanItem) {
  const n = Number(a.unitEntries[key]) || 0;
  return n > 0 && (stage.kind === "pools" || stage.kind === "round_robin") ? rrSizes(n, stage.pools ?? 1, stage.rrTopology) : [];
}

/** Selected entries are separate from planning estimates; doubles count reciprocal configured pairs only. */
export function selectedStructureEntries(a: StepAnswers, key: string): number {
  const ids = new Set(Object.keys(a.picks).filter((id) => placesOf(a.picks, id).includes(key)));
  const disc = a.disc[key] ?? a.disc[key.split("::")[0]] ?? a.playType;
  if (disc !== "doubles") return ids.size;
  const used = new Set<string>();
  return (a.pairs?.[key] ?? []).reduce((n, [x, y]) => {
    if (x === y || !ids.has(x) || !ids.has(y) || used.has(x) || used.has(y)) return n;
    used.add(x); used.add(y); return n + 1;
  }, 0);
}

/** New UI remains unavailable on published hosts or existing tournaments, even if flags broaden. */
export const rowStructurePilot = (clubId: string, flag: boolean, hostname: string, tournamentId?: string) =>
  clubId === "11111111-1111-1111-1111-111111111111" && flag && !tournamentId && (hostname === "localhost" || hostname.endsWith(".lovable.app") && hostname.includes("id-preview--"));