import { describe, expect, it } from "vitest";
import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";
import { originalStructureFromAnswers, answersFromOriginalStructure } from "@/lib/smart-builder/original-structure";
import { rowStages } from "@/lib/smart-builder/structure-rows";

const base = (): StepAnswers => ({ categories: ["Men"], subcats: {}, categoryTypes: { Men: "open" }, disc: { Men: "singles" }, unitEntries: { Men: "16" }, picks: {}, scoring: { mode: "standard", pointsPerGame: 11, bestOf: 5, winCondition: "win_by_2", timeCapPlay: "", timeCapBreak: "", timeCapMinutes: "" }, scoringOverrides: {}, format: { kind: null }, formatOverrides: {}, playoffOverrides: {}, elig: {}, stages: [{ id: "keep", date: "2026-11-01" }], days: [{ date: "2026-11-01" }], stagePlans: { Men: [{ id: "initial", kind: "round_robin", pools: 2, poolNames: ["Pool A", "Pool B"] }, { id: "future", kind: "knockout" }] } } as unknown as StepAnswers);

describe("original alternate screen local adapter", () => {
  it("keeps manual allocation override separate from combined source mode on save and reload", () => {
    const a = base();
    a.elig.Men = { mode: "leagues", leagueIds: ["league-1", "league-2"], placement: "auto", adminOverride: true };
    const raw = originalStructureFromAnswers(a);
    expect(raw.league_source_modes["1"]).toBe("selected");
    const restored = answersFromOriginalStructure(JSON.parse(JSON.stringify(a)), raw);
    expect(restored.elig.Men.adminOverride).toBe(true);
    expect(restored.elig.Men.leagueIds).toEqual(["league-1", "league-2"]);
    expect(restored.picks).toEqual(a.picks);
    expect(restored.stages).toEqual(a.stages);
  });
  it("preserves deliberately combined sources independently of manual override", () => {
    const a = base();
    a.elig.Men = { mode: "leagues", leagueIds: ["league-1", "league-2"], placement: "auto", adminOverride: false };
    a.originalStructure = { league_source_modes: { "1": "combined" } };
    expect(originalStructureFromAnswers(a).league_source_modes["1"]).toBe("combined");
    expect(a.elig.Men.adminOverride).toBe(false);
  });
  it.each([4, 5])("preserves chosen Monrad %i rounds rather than replacing with a recommendation", (rounds) => {
    const a = base(), raw = originalStructureFromAnswers(a);
    raw.league_formats["1"] = "monrad";
    raw.expected_players["1"] = 12;
    raw.monrad_rounds = { "1": rounds };
    const b = answersFromOriginalStructure(a, raw);
    expect(rowStages(b, "Men")[0].rounds).toBe(rounds);
    expect(originalStructureFromAnswers(JSON.parse(JSON.stringify(b))).monrad_rounds["1"]).toBe(rounds);
    expect(b.stages).toEqual(a.stages);
    expect(b.days).toEqual(a.days);
    expect(rowStages(b, "Men")[1]).toEqual(rowStages(a, "Men")[1]);
  });
  it("keeps planned playoffs and follow-up format independent and local after reload", () => {
    const a = base();
    const raw = originalStructureFromAnswers(a);
    raw.league_planned_playoff_rounds = { "1": ["qf", "sf", "final"] };
    raw.league_follow_up_formats = { "1": "swiss" };
    raw.league_seeding_plans = { "1": "ladder" };
    raw.league_follow_up_seeding = { "1": "previous_stage" };
    const b = answersFromOriginalStructure(a, raw);
    const restored = originalStructureFromAnswers(JSON.parse(JSON.stringify(b)));
    expect(restored.league_planned_playoff_rounds).toEqual(raw.league_planned_playoff_rounds);
    expect(restored.league_follow_up_formats).toEqual(raw.league_follow_up_formats);
    expect(restored.league_follow_up_seeding).toEqual({ "1": "previous_stage" });
    expect(restored.league_seeding_plans).toEqual({ "1": "ladder" });
    expect(b.seedingOverrides.Men).toBe("ladder");
    expect(b.categories).toEqual(["Men"]);
    expect(b.stages).toEqual(a.stages);
    expect(b.days).toEqual(a.days);
    expect(rowStages(b, "Men")[1]).toEqual(a.stagePlans?.Men[1]);
    expect(b.playoffOverrides).toEqual(a.playoffOverrides);
    expect(a.originalStructure).toBeUndefined();
  });
  it("round trips rules and preserves scheduling and later stages", () => {
    const a = base();
    const raw = originalStructureFromAnswers(a);
    raw.league_best_of["1"] = 3;
    raw.league_bye_handling = { "1": "neutral" };
    raw.division_follows = { "2": 1 };
    const b = answersFromOriginalStructure(a, raw);
    expect(b.scoringOverrides.Men.bestOf).toBe(3);
    expect(b.days).toEqual(a.days);
    expect(b.stages).toEqual(a.stages);
    expect(rowStages(b, "Men")[1]).toEqual(a.stagePlans?.Men[1]);
    expect(originalStructureFromAnswers(JSON.parse(JSON.stringify(b))).league_bye_handling).toEqual({ "1": "neutral" });
    expect(b.createdTournamentId).toBeUndefined();
  });
  it.each([8, 9, 16])("keeps Monrad local for %i entrants", (n) => {
    const raw = originalStructureFromAnswers(base());
    raw.league_formats["1"] = "monrad";
    raw.expected_players["1"] = n;
    const b = answersFromOriginalStructure(base(), raw);
    expect(rowStages(b, "Men")[0].kind).toBe("monrad");
    expect(b.unitEntries.Men).toBe(String(n));
    expect(originalStructureFromAnswers(b).league_formats["1"]).toBe("monrad");
  });
  it("preserves subdivisions distinctly from pools", () => {
    const a = base();
    a.subcats = { Men: ["Group 1"] };
    a.unitEntries["Men::Group 1"] = "16";
    const raw = originalStructureFromAnswers(a);
    raw.group_labels["1"] = "Group North";
    const b = answersFromOriginalStructure(a, raw);
    expect(b.categories).toEqual(["Men"]);
    expect(b.subcats.Men).toEqual(["Group North"]);
    expect(rowStages(b, "Men::Group North")[0].poolNames).toEqual(["Pool A", "Pool B"]);
  });
  it("adds a division without carrying any players or changing existing identities", () => {
    const a = base(), raw = originalStructureFromAnswers(a);
    raw.num_groups = 2;
    raw.group_labels["2"] = "Ladies";
    raw.league_formats["2"] = "swiss";
    const b = answersFromOriginalStructure(a, raw);
    expect(b.categories).toEqual(["Men", "Ladies"]);
    expect(b.picks).toEqual({});
    expect(rowStages(b, "Men")[0].id).toBe("initial");
  });
});