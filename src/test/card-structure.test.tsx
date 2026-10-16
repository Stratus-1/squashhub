import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CardStructureEditor } from "@/components/smart-builder/CardStructureEditor";
import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";
import { addCardDivision, addCardSubdivision, cardStructurePilot, cardStructureIssues, dropCardStructureSeedingStep, mergeCardStructureSteps, patchCardStage, saveCardStructure } from "@/lib/smart-builder/card-structure";
import { rowStages } from "@/lib/smart-builder/structure-rows";

const base = (): StepAnswers => ({ categories: [""], categoryTypes: {}, subcats: {}, unitEntries: {}, disc: {}, playType: null, format: { kind: null }, formatOverrides: {}, picks: {}, scoring: { mode: "standard", pointsPerGame: 11, bestOf: 5, winCondition: "win_by_2", timeCapPlay: "", timeCapBreak: "", timeCapMinutes: "" }, scoringOverrides: {}, playoffOverrides: {}, poolPlan: {}, guide: {}, stages: [{ id: "r1", unit: "", mode: "scheduled", date: "2026-11-01", from: "18:00", to: "21:00", courtIds: ["court1"] }], days: [{ date: "2026-11-01", venue: "Test", courts: "1", windows: [{ from: "18:00", to: "21:00" }] }], playoffSync: true } as unknown as StepAnswers);

describe("replacement card structure", () => {
  it("allows Riverside new drafts on all hosts, including editing created tournaments, never other clubs", () => {
    const r = "11111111-1111-1111-1111-111111111111";
    expect(cardStructurePilot(r, "localhost")).toBe(true);
    expect(cardStructurePilot(r, "id-preview--example.lovable.app")).toBe(true);
    for (const host of ["squashhub.co.za", "squashhub.lovable.app", "riverside.squashhub.co.za"]) {
      expect(cardStructurePilot(r, host)).toBe(true);
      expect(cardStructurePilot(r, host, "created")).toBe(true);
      expect(cardStructurePilot("d8397b8a-60d3-4c4b-afee-25dab218bf19", host)).toBe(true);
    }
    expect(cardStructurePilot(r, "localhost", "created")).toBe(true);
    expect(cardStructurePilot("uitsig", "localhost")).toBe(true);
    expect(cardStructurePilot("d8397b8a-60d3-4c4b-afee-25dab218bf19", "localhost", "created", true)).toBe(true);
  });
  it("merges seven steps but preserves scheduling, dates, courts, seeding and payments", () => {
    expect(mergeCardStructureSteps(["Type", "Basics", "What", "Match", "Categories", "Guide", "Subcategories", "Overrides", "Format", "Seeding", "Fees", "Schedule", "Dates", "Courts", "Summary"], "Structure")).toEqual(["Type", "Basics", "Structure", "Seeding", "Fees", "Schedule", "Dates", "Courts", "Summary"]);
  });
  it("drops the separate Seeding step because the structure page sets seeding per category", () => {
    const merged = mergeCardStructureSteps(["Type", "Basics", "What", "Match", "Categories", "Guide", "Subcategories", "Overrides", "Format", "Seeding", "Fees", "Schedule", "Dates", "Courts", "Summary"], "Structure");
    expect(dropCardStructureSeedingStep(merged)).toEqual(["Type", "Basics", "Structure", "Fees", "Schedule", "Dates", "Courts", "Summary"]);
    expect(dropCardStructureSeedingStep(["Type", "Seeding", "Fees"])).toEqual(["Type", "Fees"]);
  });
  it("round-trips independent subdivisions and named pools without altering scheduling", () => {
    const original = base();
    let a = addCardDivision(original, "round_robin").answers;
    a.unitEntries["Division 1"] = "16";
    a = addCardSubdivision(a, "Division 1").answers;
    a = patchCardStage(a, "Division 1::Group 1", { pools: 2, poolNames: ["Pool A", "Pool B"] });
    const saved = JSON.parse(JSON.stringify(saveCardStructure(a))) as StepAnswers;
    expect(saved.subcats["Division 1"]).toEqual(["Group 1"]);
    expect(rowStages(saved, "Division 1::Group 1")[0].poolNames).toEqual(["Pool A", "Pool B"]);
    expect(saved.stages).toEqual(original.stages);
    expect(saved.days).toEqual(original.days);
    expect(saved.createdTournamentId).toBeUndefined();
    expect(cardStructureIssues(saved)).toEqual([]);
  });
  it("preserves future stages when editing initial format, and derives mixed discipline", () => {
    let a = addCardDivision(base(), "swiss").answers;
    a.stagePlans = { "Division 1": [{ id: "one", kind: "swiss", rounds: 5 }, { id: "two", kind: "monrad" }] };
    a = patchCardStage(a, "Division 1", { rounds: 4 });
    expect(rowStages(a, "Division 1")[1]).toEqual({ id: "two", kind: "monrad" });
    a = addCardDivision(a, "knockout").answers;
    a.disc["Division 2"] = "doubles";
    expect(saveCardStructure(a).playType).toBe("both");
  });
  it.each([8, 9, 16])("allows Monrad planning for %i entrants without generating anything", (n) => {
    const a = addCardDivision(base(), "monrad").answers;
    a.unitEntries["Division 1"] = String(n);
    expect(cardStructureIssues(a)).toEqual([]);
    expect(rowStages(saveCardStructure(a), "Division 1")[0].kind).toBe("monrad");
  });
  it("renders palette, explicit save and editable group/pool fields", () => {
    const onSave = vi.fn();
    render(<CardStructureEditor answers={base()} onSave={onSave} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Round robin$/ })[0]);
    fireEvent.change(screen.getByLabelText("Division 1 expected entries"), { target: { value: "16" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Group" }));
    fireEvent.change(screen.getByLabelText("Division 1::Group 1 pool count"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Division 1::Group 1 pool 2 name"), { target: { value: "Pool B North" } });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save Structure" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(rowStages(onSave.mock.calls[0][0], "Division 1::Group 1")[0].poolNames).toEqual(["Pool A", "Pool B North"]);
    fireEvent.click(screen.getByRole("button", { name: "Close format descriptions" }));
    expect(screen.queryByRole("complementary", { name: "Format descriptions" })).toBeNull();
  });
});