import { disciplineOf, type PlannedStage } from "@/lib/tournaments/contract";
import type { PlannedPlayoff, SpecDivision } from "@/lib/tournaments/engine-service";
import { expectedGamesForStageName, seededBracketText, seededLinesIssues } from "@/lib/tournaments/seeded-bracket";
import { parseMapping } from "@/lib/tournaments/mapping";
import { plannedPlayoffStages } from "@/lib/smart-builder/step-draw";

// Presentation/preflight pilot only; this is not an authorization or generation gate.
export const RIVERSIDE_PLAYOFF_PILOT = "11111111-1111-1111-1111-111111111111";
export const swissSetupPilot = (clubId: unknown, optedIn: boolean, sourceKind: unknown) =>
  !!clubId && optedIn === true && sourceKind === "swiss";

export type LaterStage = { stageKey: string; name: string; plannedDate: string | null; plan?: PlannedPlayoff };

/** Standard play-off chains: the stage list's length fixes the bracket (QF→SF→F = Top 8). */
const CHAIN_NAMES: Record<number, string[]> = { 1: ["Final"], 2: ["Semifinal", "Final"], 3: ["Quarterfinal", "Semifinal", "Final"] };
const norm = (n: string) => n.toLowerCase().replace(/[\s-]/g, "");

export function scheduleFromPlan(p: PlannedPlayoff | null | undefined): PlannedStage["schedule"] | null {
  if (!p) return null;
  const courts = (p.courtIds ?? []).map(Number).filter(Number.isFinite);
  if (p.mode === "scheduled" && p.date) return { rule: "fixed", date: p.date, roundDates: [p.date], timeFrom: p.from || null, timeTo: p.to || null, courtIds: courts };
  if (p.mode === "play_by" && p.deadline) return { rule: "play_by", deadline: p.deadline, roundDates: [p.deadline], courtIds: courts };
  return null;
}

/**
 * Saved Stages & Scheduling play-off rows for this category (category-specific rows win; "All categories"
 * rows apply to every category, each from its own standings). Authoritative over the generic Playoffs answers.
 */
export function timelineIntent(saved: any, divisionLabel: string) {
  const key = divisionLabel.replace(/\s*·\s*(Singles|Doubles|Mixed).*$/i, "").trim();
  const rows = plannedPlayoffStages(saved ?? null, key);
  const own = rows.length ? (saved?.stages ?? []).some((s: any) => s?.phase === "playoff" && s.unit && (s.unit === key || s.unit === key.split("::")[0])) : false;
  return { key, rows, categorySpecific: own };
}

/**
 * Reads the saved setup for a Swiss category's next play-off stage and says, without writing anything,
 * whether it already exists (runnable), can be set up from the saved plan (planning target), or genuinely
 * disagrees. Never invents a qualifier count, pairing or stage.
 */
export function savedSwissPlayoff(d: SpecDivision, source: PlannedStage, stageKey: string, stageName: string, saved: any, field: number) {
  const issues: string[] = [];
  const notes: string[] = [];
  const discipline = disciplineOf(d, source);
  const existing = d.stages.find((s) => s.id === stageKey);
  const later = (d.deferredStages ?? []) as LaterStage[];
  const target = later.find((s) => s.stageKey === stageKey) ?? null;
  const expected = expectedGamesForStageName(stageName);
  const { key, rows } = timelineIntent(saved, d.label);
  const configured = existing?.mapping;
  let top = 0;
  let schedule: PlannedStage["schedule"] | null = null;
  let trigger: "auto" | "confirm" | null = null;
  let laterSync: LaterStage[] | null = null;
  let fromTimeline = false;

  if (configured) {
    if (configured.source !== "stage_standings" || configured.sourceStageId !== source.id || configured.pools !== 1)
      issues.push("The saved playoff does not use this category’s Swiss standings. Edit Tournament Setup.");
    top = configured.units.length;
    const actual = configured.matches.map((m) => `${m.a} v ${m.b}`).join("\n");
    if (top >= 2 && (top & (top - 1)) === 0) {
      const wanted = seededBracketText(top).replace(/R1: /g, "");
      if (actual !== wanted) issues.push("The saved playoff pairings are not the configured seeded bracket. Edit Tournament Setup; existing pairings are not overwritten.");
    }
  } else if (!target) {
    issues.push(`${stageName} is neither a runnable stage nor a saved planning target for this category. Return to Tournament Setup; this screen will not add another stage.`);
  } else if (rows.length) {
    // Authoritative: the Stages & Scheduling play-off list.
    fromTimeline = true;
    const names = rows.map((r) => r.name);
    const want = CHAIN_NAMES[names.length];
    if (!want || names.some((n, i) => norm(n) !== norm(want[i])))
      issues.push(`The saved playoff stages (${names.join(" → ")}) are not a standard chain (Quarterfinal → Semifinal → Final). Edit Tournament Setup.`);
    else top = 2 ** names.length;
    if (norm(names[0]) !== norm(target.name) || norm(target.name) !== norm(stageName))
      issues.push(`The first saved playoff stage is ${names[0]}, but the stage waiting here is ${target.name}. Edit Tournament Setup; nothing is renamed automatically.`);
    const first = rows[0].plan;
    if (first.pairing !== "seeded") issues.push(`${names[0]} pairing is "${first.pairing ?? "decide later"}" in Stages & Scheduling; a Swiss category needs Seeded (1 v ${top || 8}). Edit Tournament Setup.`);
    for (const r of rows.slice(1)) if (r.plan.pairing && !["winners", "later"].includes(r.plan.pairing))
      issues.push(`${r.name} pairing is "${r.plan.pairing}"; after ${names[0]} only winners of the previous stage can play. Edit Tournament Setup.`);
    schedule = scheduleFromPlan(first);
    if (!schedule) issues.push(`${names[0]}: its date / play-by deadline is still "Decide later" in Stages & Scheduling.`);
    trigger = first.trigger;
    // Planning targets still waiting after this one: saved names must be a prefix of the stage list.
    const rest = later.filter((s) => s.stageKey !== stageKey);
    const restNames = rows.slice(1).map((r) => r.name);
    if (rest.some((s, i) => !restNames[i] || norm(s.name) !== norm(restNames[i])))
      issues.push(`The tournament's later stages (${rest.map((s) => s.name).join(", ")}) disagree with Stages & Scheduling (${restNames.join(", ")}). Edit Tournament Setup; nothing is removed automatically.`);
    else {
      const version = stageKey.replace(/-po\d+$/, "");
      laterSync = rows.slice(1).map((r, i) => ({
        stageKey: rest[i]?.stageKey ?? `${version}-po${i + 2}`,
        name: rest[i]?.name ?? r.name,
        plannedDate: r.plan.date || r.plan.deadline || null,
        plan: r.plan,
      }));
      const added = laterSync.slice(rest.length).map((s) => s.name);
      if (added.length) notes.push(`${added.join(" and ")} from Stages & Scheduling will be added as later stages.`);
      if (target.plan?.pairing !== first.pairing) notes.push(`${target.name} pairing is taken from Stages & Scheduling (Seeded).`);
    }
  } else {
    // No stage list at all: fall back to the generic Playoffs answers. A stage name alone is NOT a
    // saved qualification count; the saved answers must explicitly agree with that stage.
    const playoff = saved?.playoffOverrides?.[key] ?? saved?.playoffOverrides?.[key.split("::")[0]] ?? saved?.playoff;
    if (playoff?.choice !== "playoffs" || playoff?.qualification !== "top_pools")
      issues.push("Swiss qualification is not saved as Top players/pairs on standings. Edit Tournament Setup; no qualifier count will be guessed.");
    if (playoff?.pairing !== "seeded") issues.push("Seeded playoff pairing is not saved. Edit Tournament Setup.");
    if (playoff?.style !== "championship") issues.push("Championship playoff format is not confirmed. Edit Tournament Setup.");
    const rounds = Number(playoff?.rounds);
    if (Number.isInteger(rounds) && rounds >= 1 && rounds <= 3) top = 2 ** rounds;
    else issues.push("The saved playoff round count is missing or invalid. Edit Tournament Setup.");
    schedule = scheduleFromPlan(target.plan);
    trigger = target.plan?.trigger ?? null;
  }
  if (!issues.length || top) {
    if (expected == null || top !== expected * 2) issues.push(`${stageName} needs Top ${expected == null ? "N (confirm stage size)" : expected * 2}; the saved qualification count ${top || "is missing"}. Edit Tournament Setup.`);
  }
  if (top && field < top) issues.push(`Only ${field} Swiss entries are available for ${top} qualifying places.`);
  const validSize = top >= 2 && (top & (top - 1)) === 0;
  const text = validSize ? seededBracketText(top) : "";
  if (validSize) issues.push(...seededLinesIssues(text, stageName, field));
  // One finishing position already identifies an entire registered pair. Mapping
  // must not combine two ranked pairs into a new team.
  const parsed = validSize ? parseMapping(text, { source: "stage_standings", sourceStageId: source.id, pools: 1, poolSize: field, discipline: "singles" }) : { mapping: null };
  const mode: "existing" | "setup" | "blocked" = existing ? "existing" : target ? "setup" : "blocked";
  return { top, discipline, existing, target, mode, fromTimeline, schedule, trigger, laterSync, notes, mapping: configured ?? parsed.mapping, issues: [...new Set(issues)] };
}
