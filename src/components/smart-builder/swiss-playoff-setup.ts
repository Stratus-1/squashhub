import { disciplineOf, type PlannedStage } from "@/lib/tournaments/contract";
import type { SpecDivision } from "@/lib/tournaments/engine-service";
import { expectedGamesForStageName, seededBracketText, seededLinesIssues } from "@/lib/tournaments/seeded-bracket";
import { parseMapping } from "@/lib/tournaments/mapping";

// Presentation/preflight pilot only; this is not an authorization or generation gate.
export const RIVERSIDE_PLAYOFF_PILOT = "11111111-1111-1111-1111-111111111111";
export const swissSetupPilot = (clubId: unknown, optedIn: boolean, sourceKind: unknown) =>
  clubId === RIVERSIDE_PLAYOFF_PILOT && optedIn === true && sourceKind === "swiss";

export function savedSwissPlayoff(d: SpecDivision, source: PlannedStage, stageKey: string, stageName: string, saved: any, field: number) {
  const issues: string[] = [];
  const discipline = disciplineOf(d, source);
  const existing = d.stages.find((s) => s.id === stageKey);
  if (!existing) issues.push(`${stageName} is saved as a planning target, but its runnable stage definition is absent. Return to Tournament Setup; this screen will not add another stage.`);
  const expected = expectedGamesForStageName(stageName);
  const key = d.label.replace(/\s*·\s*(Singles|Doubles|Mixed).*$/i, "").trim();
  const playoff = saved?.playoffOverrides?.[key] ?? saved?.playoffOverrides?.[key.split("::")[0]] ?? saved?.playoff;
  const configured = existing?.mapping;
  let top = 0;
  if (configured) {
    if (configured.source !== "stage_standings" || configured.sourceStageId !== source.id || configured.pools !== 1)
      issues.push("The saved playoff does not use this category’s Swiss standings. Edit Tournament Setup.");
    top = configured.units.length;
    const actual = configured.matches.map((m) => `${m.a} v ${m.b}`).join("\n");
    if (top >= 2 && (top & (top - 1)) === 0) {
      const wanted = seededBracketText(top).replace(/R1: /g, "");
      if (actual !== wanted) issues.push("The saved playoff pairings are not the configured seeded bracket. Edit Tournament Setup; existing pairings are not overwritten.");
    }
  } else {
    // A stage name alone is NOT a saved qualification count. The saved qualification
    // choice and bracket depth must explicitly agree with that stage.
    if (playoff?.choice !== "playoffs" || playoff?.qualification !== "top_pools")
      issues.push("Swiss qualification is not saved as Top players/pairs on standings. Edit Tournament Setup; no qualifier count will be guessed.");
    if (playoff?.pairing !== "seeded") issues.push("Seeded playoff pairing is not saved. Edit Tournament Setup.");
    if (playoff?.style !== "championship") issues.push("Championship playoff format is not confirmed. Edit Tournament Setup.");
    const rounds = Number(playoff?.rounds);
    if (Number.isInteger(rounds) && rounds >= 1 && rounds <= 3) top = 2 ** rounds;
    else issues.push("The saved playoff round count is missing or invalid. Edit Tournament Setup.");
  }
  if (expected == null || top !== expected * 2) issues.push(`${stageName} needs Top ${expected == null ? "N (confirm stage size)" : expected * 2}; the saved qualification count ${top || "is missing"}. Edit Tournament Setup.`);
  if (field < top) issues.push(`Only ${field} Swiss entries are available for ${top} qualifying places.`);
  const validSize = top >= 2 && (top & (top - 1)) === 0;
  const text = validSize ? seededBracketText(top) : "";
  if (validSize) issues.push(...seededLinesIssues(text, stageName, field));
  // One finishing position already identifies an entire registered pair. Mapping
  // must not combine two ranked pairs into a new team.
  const parsed = parseMapping(text, { source: "stage_standings", sourceStageId: source.id, pools: 1, poolSize: field, discipline: "singles" });
  return { top, discipline, existing, mapping: configured ?? parsed.mapping, issues: [...new Set(issues)] };
}