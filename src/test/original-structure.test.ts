import { describe, expect, it } from "vitest";
import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";
import { originalStructureFromAnswers, answersFromOriginalStructure, structurePoolGroups, structureSlotTimes } from "@/lib/smart-builder/original-structure";
import { rowStages } from "@/lib/smart-builder/structure-rows";
import { categoryDisplayName } from "@/lib/smart-builder/category-labels";

const base = (): StepAnswers => ({ categories: ["Men"], subcats: {}, categoryTypes: { Men: "open" }, disc: { Men: "singles" }, unitEntries: { Men: "16" }, picks: {}, scoring: { mode: "standard", pointsPerGame: 11, bestOf: 5, winCondition: "win_by_2", timeCapPlay: "", timeCapBreak: "", timeCapMinutes: "" }, scoringOverrides: {}, format: { kind: null }, formatOverrides: {}, playoffOverrides: {}, elig: {}, stages: [{ id: "keep", date: "2026-11-01" }], days: [{ date: "2026-11-01" }], stagePlans: { Men: [{ id: "initial", kind: "round_robin", pools: 2, poolNames: ["Pool A", "Pool B"] }, { id: "future", kind: "knockout" }] } } as unknown as StepAnswers);

describe("original alternate screen local adapter", () => {
  it("uses saved pool times ahead of the duplicate singles estimate after reopening", () => {
    const a = base();
    a.scheduling = { singles: "45", doubles: "", rest: "" };
    const raw = originalStructureFromAnswers(a);
    raw.pool_durations = { "1:1": 10, "1:2": 20 };
    raw.group_durations = { "1": 30 };
    raw.league_scoring_modes = { "1": "first_to_target" };
    const restored = answersFromOriginalStructure(a, raw);
    expect(structureSlotTimes(JSON.parse(JSON.stringify(restored)), "Men")).toEqual({ slotMinutes: 20, poolSlots: [10, 20], inherited: true });
    expect(originalStructureFromAnswers(restored).pool_durations).toEqual(raw.pool_durations);
    expect(restored.days).toEqual(a.days);
  });
  it("renames a saved category without changing its player, pool, playoff or scheduling links", () => {
    const a = base();
    a.createdTournamentId = "existing";
    a.picks = { player: ["Men"] };
    a.fee = { has: true, amount: "50", varies: true, perUnit: { Men: "50" }, doublesBasis: "player", doublesCover: null };
    a.courtRules = [{ key: "Men", courts: [20] }] as unknown as StepAnswers["courtRules"];
    const raw = originalStructureFromAnswers(a);
    raw.group_labels["1"] = "Doubles Open renamed";
    const b = answersFromOriginalStructure(a, raw);
    expect(b.categories).toEqual(["Men"]);
    expect(b.picks).toEqual({ player: ["Men"] });
    expect(b.fee).toEqual(a.fee);
    expect(b.courtRules).toEqual(a.courtRules);
    expect(b.stagePlans).toEqual(a.stagePlans);
    expect(b.stages).toEqual(a.stages);
    expect(b.days).toEqual(a.days);
    expect(categoryDisplayName(b, "Men")).toBe("Doubles Open renamed");
    const reopened = originalStructureFromAnswers(JSON.parse(JSON.stringify(b)));
    expect(reopened._unit_keys).toEqual(["Men"]);
    expect(reopened.group_labels["1"]).toBe("Doubles Open renamed");
  });
  it.each(["even_odd", "by_position", "second_server"] as const)("retains Bells doubles serving %s on save and reload", (method) => {
    const a = base();
    a.disc.Men = "doubles";
    a.scoringOverrides.Men = { ...a.scoringOverrides.Men, ...a.scoring, mode: "time_capped_points" } as NonNullable<StepAnswers["scoring"]>;
    const raw = originalStructureFromAnswers(a);
    raw.league_doubles_serving_methods["1"] = method;
    const restored = answersFromOriginalStructure(a, raw);
    expect(restored.serving?.Men).toBe(method);
    expect(originalStructureFromAnswers(JSON.parse(JSON.stringify(restored))).league_doubles_serving_methods["1"]).toBe(method);
    expect(restored.days).toEqual(a.days);
  });
  it("clears an existing doubles method when Not set / Manual is selected", () => {
    const a = base();
    a.serving = { Men: "second_server" };
    const raw = originalStructureFromAnswers(a);
    delete raw.league_doubles_serving_methods["1"];
    const restored = answersFromOriginalStructure(a, raw);
    expect(restored.serving?.Men).toBeUndefined();
    expect(originalStructureFromAnswers(restored).league_doubles_serving_methods["1"]).toBeUndefined();
  });
  it("round trips per-category RR finish through the reachable original screen without changing manual rounds", () => {
    const a = base();
    a.stagePlans = { Men: [{ id: "s", kind: "swiss", rounds: 4, endAfterRound: 4 }] };
    const raw = originalStructureFromAnswers(a);
    expect(raw.swiss_rounds["1"]).toBe(4);
    raw.swiss_rounds["1"] = 5;
    raw.swiss_rr_finish = { "1": { enabled: true, groups: 3 } };
    const restored = answersFromOriginalStructure(a, raw);
    expect(rowStages(restored, "Men")[0]).toMatchObject({ rounds: 5, endAfterRound: 5, rrFinish: { enabled: true, groups: 3 } });
    expect(originalStructureFromAnswers(JSON.parse(JSON.stringify(restored))).swiss_rr_finish["1"]).toEqual({ enabled: true, groups: 3 });
    expect(restored.stages).toEqual(a.stages);
  });
  it("preserves category locks through the real structure save adapter", () => {
    const a = base();
    const raw = originalStructureFromAnswers(a);
    raw.category_locks = { Men: true };
    const restored = answersFromOriginalStructure(a, raw);
    expect(originalStructureFromAnswers(JSON.parse(JSON.stringify(restored))).category_locks).toEqual({ Men: true });
    expect(restored.stages).toEqual(a.stages);
    expect(restored.picks).toEqual(a.picks);
  });
  it("shows Men's A as two pools without merging or renumbering its live units", () => {
    const a = base();
    a.categories = ["Mens A", "Mens B", "Ladies A"];
    a.subcats = { "Mens A": ["1", "2"] };
    a.unitEntries = { "Mens A::1": "4", "Mens A::2": "4", "Mens B": "24", "Ladies A": "9" };
    a.stagePlans = Object.fromEntries(Object.keys(a.unitEntries).map((key) => [key, [{ id: key, kind: "round_robin", pools: 1 }]]));
    a.createdTournamentId = "existing";
    a.picks = { player: ["Mens A::2"] };
    const raw = originalStructureFromAnswers(a);
    expect(raw._pool_groups).toEqual([{ parent: "Mens A", label: "Men's A", slots: [1, 2] }]);
    expect(raw.num_groups).toBe(4);
    expect(raw.group_labels).toEqual({ "1": "1", "2": "2", "3": "Mens B", "4": "Ladies A" });
    const restored = answersFromOriginalStructure(a, JSON.parse(JSON.stringify(raw)));
    expect(structurePoolGroups(restored)).toEqual(raw._pool_groups);
    expect(originalStructureFromAnswers(restored)._unit_keys).toEqual(raw._unit_keys);
    expect(restored.picks).toEqual(a.picks);
    expect(restored.categories).toEqual(a.categories);
    expect(raw.swiss_pools).toEqual({ "1": 1, "2": 1, "3": 1, "4": 1 });
  });
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
describe("category duplicate and remove", () => {
  const stripSlot = (raw: any, slot: number) => {
    raw._unit_keys = (raw._unit_keys as string[]).filter((_, i) => i !== slot - 1);
    raw.num_groups = (raw.num_groups as number) - 1;
    for (const map of ["group_labels", "expected_players", "league_formats", "swiss_pools", "swiss_rounds", "league_genders", "league_match_types", "league_scoring_modes"]) {
      if (!raw[map]) continue;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw[map] as Record<string, unknown>)) {
        const n = Number(k);
        if (!Number.isFinite(n) || n < slot) out[k] = v;
        else if (n > slot) out[String(n - 1)] = v;
      }
      raw[map] = out;
    }
    return raw;
  };

  it("removes an empty second category without touching the first category's settings or players", () => {
    const a = base();
    a.categories = ["Men", "League 2"];
    a.unitEntries["League 2"] = "8";
    a.stagePlans["League 2"] = [{ id: "l2", kind: "round_robin", pools: 1 }];
    a.picks = { p1: ["Men"], p2: ["Men", "League 2"] };
    const raw = stripSlot(originalStructureFromAnswers(a), 2);
    const b = answersFromOriginalStructure(a, raw);
    expect(b.categories).toEqual(["Men"]);
    expect(b.subcats).toEqual({});
    expect(rowStages(b, "Men")[0].id).toBe("initial");
    expect(b.unitEntries.Men).toBe("16");
    // Picks stay draft-local; the handover only accepts keys that still exist.
    expect(b.picks.p1).toEqual(["Men"]);
  });

  it("removes a whole pooled category when all its pool slots are removed", () => {
    const a = base();
    a.categories = ["Open"];
    a.subcats = { Open: ["1", "2"] };
    a.unitEntries = { "Open::1": "6", "Open::2": "6" };
    a.stagePlans = { "Open::1": [{ id: "p1", kind: "round_robin", pools: 1 }], "Open::2": [{ id: "p2", kind: "round_robin", pools: 1 }] };
    const raw = originalStructureFromAnswers(a);
    expect(raw._pool_groups).toEqual([{ parent: "Open", label: "Open", slots: [1, 2] }]);
    stripSlot(raw, 2);
    stripSlot(raw, 1);
    const b = answersFromOriginalStructure(a, raw);
    expect(b.categories).toEqual([]);
    expect(b.subcats).toEqual({});
  });

  it("duplicates a pooled category as a new category with the same pool count and no players", () => {
    const a = base();
    a.categories = ["Open"];
    a.subcats = { Open: ["1", "2"] };
    a.unitEntries = { "Open::1": "6", "Open::2": "6" };
    a.stagePlans = { "Open::1": [{ id: "p1", kind: "round_robin", pools: 1 }], "Open::2": [{ id: "p2", kind: "round_robin", pools: 1 }] };
    a.picks = { p1: ["Open::1"] };
    const raw = originalStructureFromAnswers(a);
    raw.num_groups = 3;
    raw._unit_keys = [...raw._unit_keys, ""];
    raw.group_labels["3"] = "Open (copy)";
    raw.expected_players["3"] = 12;
    raw.league_formats["3"] = raw.league_formats["1"];
    raw.swiss_pools["3"] = 2;
    const b = answersFromOriginalStructure(a, raw);
    expect(b.categories).toEqual(["Open", "Open (copy)"]);
    expect(b.subcats.Open).toEqual(["1", "2"]);
    expect(rowStages(b, "Open (copy)")[0].kind).toBe("round_robin");
    expect(rowStages(b, "Open (copy)")[0].pools).toBe(2);
    expect(b.picks).toEqual({ p1: ["Open::1"] });
  });
});
