import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StructureRowsEditor } from "@/components/smart-builder/StructureRowsEditor";
import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";
import { duplicateStructureRow, renameStructureKey, rowStructurePilot, writeRowStages, selectedStructureEntries, applyStructurePreset, structureEligibility, structureEligibilityAdvisory } from "@/lib/smart-builder/structure-rows";
import { isPlayerEligibleForCategory, validatePairComposition } from "@/lib/leagues/category";

const answers = (): StepAnswers => ({ categories: ["Mens A", "Mens B", "Ladies A"], categoryTypes: { "Mens A": "mens", "Mens B": "mens", "Ladies A": "ladies" }, subcats: {}, unitEntries: { "Mens A": "24", "Mens B": "18", "Ladies A": "16" }, disc: { "Mens A": "singles", "Mens B": "singles", "Ladies A": "singles" }, playType: "singles", format: { kind: "swiss", swissRounds: "5" }, formatOverrides: {}, picks: {}, scoringOverrides: {}, playoffOverrides: {}, poolPlan: {}, playoff: { choice: "later", rounds: 2, qualification: "later", pairing: "later" }, stagePlans: { "Mens A": [{ id: "a", kind: "swiss", rounds: 5 }], "Mens B": [{ id: "b", kind: "swiss", rounds: 4 }], "Ladies A": [{ id: "l", kind: "pools", pools: 4 }] } } as unknown as StepAnswers);
const draw = (a = answers()) => { const onSave = vi.fn(); render(<TooltipProvider><StructureRowsEditor answers={a} onSave={onSave} /></TooltipProvider>); return onSave; };

describe("row structure editor", () => {
  it.each(["singles", "doubles"] as const)("keeps Men's %s Open or Men only independently of name and format", (disc) => {
    const a = answers(); a.categoryTypes["Mens A"] = "open";
    const name = disc === "singles" ? "Men's Singles" : "Men's Doubles";
    const preset = applyStructurePreset(a, "Mens A", name);
    expect(structureEligibility(preset, name)).toBe("open");
    expect(isPlayerEligibleForCategory("female", structureEligibility(preset, name))).toBe(true);
    expect(validatePairComposition(["male", "female"], structureEligibility(preset, name)).valid).toBe(true);
    const save = draw(preset);
    expect(screen.getByRole("columnheader", { name: "Match type" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Eligibility" })).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("eligibility is Open");
    fireEvent.change(screen.getByLabelText(`${name} eligibility type`), { target: { value: "mens" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Structure" }));
    const next = save.mock.calls[0][0] as StepAnswers;
    expect(next.categories).toContain(name);
    expect(next.disc[name]).toBe(disc);
    expect(next.stagePlans[name]).toEqual(preset.stagePlans[name]);
    expect(isPlayerEligibleForCategory("female", structureEligibility(next, name))).toBe(false);
    expect(validatePairComposition(["male", "female"], structureEligibility(next, name)).valid).toBe(false);
    expect(validatePairComposition(["male", "male"], structureEligibility(next, name)).valid).toBe(true);
  });
  it("preserves explicit eligibility on presets, duplicate, rename and subgroup inheritance", () => {
    const a = answers(); a.categoryTypes["Mens A"] = "open"; a.subcats["Mens A"] = ["A", "B"];
    const p = applyStructurePreset(a, "Mens A", "Men's Doubles");
    expect(structureEligibility(p, "Men's Doubles::A")).toBe("open");
    expect(p.disc["Men's Doubles::B"]).toBe("doubles");
    expect(structureEligibility(duplicateStructureRow(p, "Men's Doubles"), "Men's Doubles copy::A")).toBe("open");
    expect(structureEligibility(renameStructureKey(p, "Men's Doubles", "Custom"), "Custom::A")).toBe("open");
    expect(structureEligibilityAdvisory(p, "Men's Doubles")).toContain("Your selection applies");
    expect(applyStructurePreset(p, "Men's Doubles", "Ladies Doubles").categoryTypes["Ladies Doubles"]).toBe("open");
  });
  it("prefills only missing eligibility and renders inherited subgroup eligibility", () => {
    const a = answers(); delete a.categoryTypes["Mens A"];
    expect(applyStructurePreset(a, "Mens A", "Men's Singles").categoryTypes["Men's Singles"]).toBe("mens");
    a.categoryTypes["Mens A"] = "open"; a.subcats["Mens A"] = ["A"]; a.unitEntries["Mens A::A"] = "24";
    draw(a); fireEvent.click(screen.getByRole("button", { name: "Expand Mens A" }));
    expect(screen.getByText("Open · inherited")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Mens A eligibility type"), { target: { value: "mens" } });
    expect(screen.getByText("Men only · inherited")).toBeTruthy();
  });
  it("starts direct with correct capacity and saves only explicitly", () => {
    const save = draw();
    expect(screen.getByRole("button", { name: "I know what I want" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByLabelText("Structure advice")).toBeNull();
    expect(screen.getByText("4 / 4 / 4 / 4 entries · 24 within-pool matches")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Mens A next stage"), { target: { value: "undecided" } });
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save Structure" }));
    expect(save.mock.calls[0][0].stagePlans["Mens A"][1].kind).toBeNull();
    expect(save.mock.calls[0][0].createdTournamentId).toBeUndefined();
  });
  it("guided questions never change formats until Apply", () => {
    const save = draw();
    fireEvent.click(screen.getByRole("button", { name: "Help me choose" }));
    expect(screen.getAllByRole("button", { name: "Apply recommendation" }).length).toBe(3);
    expect((screen.getByLabelText("Mens B Swiss rounds") as HTMLInputElement).value).toBe("4");
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Apply recommendation" })[0]);
    expect(screen.getByText("Unsaved structure")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });
  it("expands subdivisions with independent entry counts", () => {
    const a = answers(); a.subcats["Mens A"] = ["First League", "Seventh League"]; a.unitEntries["Mens A::First League"] = "14"; a.unitEntries["Mens A::Seventh League"] = "10";
    draw(a);
    expect(screen.queryByLabelText("Mens A::First League expected entries")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Mens A" }));
    expect((screen.getByLabelText("Mens A::First League expected entries") as HTMLInputElement).value).toBe("14");
    expect((screen.getByLabelText("Mens A::Seventh League expected entries") as HTMLInputElement).value).toBe("10");
  });
  it("duplicate configuration never copies entrants or pairs", () => {
    const a = answers(); a.picks = { player: ["Mens A"] }; a.pairs = { "Mens A": [["one", "two"]] };
    const copy = duplicateStructureRow(a, "Mens A");
    expect(copy.picks).toEqual(a.picks);
    expect(copy.pairs?.["Mens A copy"]).toBeUndefined();
    expect(copy.stagePlans?.["Mens A copy"][0].id).not.toBe("a");
  });
  it("renames draft references atomically without mutation", () => {
    const a = answers(); a.subcats["Mens A"] = ["A"]; a.picks = { player: ["Mens A::A"] }; a.unitEntries["Mens A::A"] = "24";
    const renamed = renameStructureKey(a, "Mens A", "Men's Singles");
    expect(renamed.picks.player).toEqual(["Men's Singles::A"]);
    expect(renamed.unitEntries["Men's Singles::A"]).toBe("24");
    expect(a.picks.player).toEqual(["Mens A::A"]);
  });
  it("keeps RR backward-compatible", () => {
    const a = writeRowStages(answers(), "Mens A", [{ id: "rr", kind: "round_robin" }]);
    expect(a.stagePlans?.["Mens A"][0].kind).toBe("round_robin");
    expect(a.formatOverrides["Mens A"].kind).toBe("pools");
  });
  it("saves exact between/custom choices without applying a draw", () => {
    const save = draw();
    fireEvent.click(screen.getByRole("button", { name: "Expand Ladies A" }));
    fireEvent.click(screen.getByRole("button", { name: "Between selected pools/groups · 96 matches" }));
    expect(screen.getByTestId("structure-capacity").textContent).toContain("192");
    fireEvent.click(screen.getByRole("button", { name: "Custom group matchup matrix · 96 matches" }));
    fireEvent.click(screen.getByLabelText("Ladies A stage 1 Pool A vs Pool A"));
    expect(screen.getByTestId("structure-capacity").textContent).toContain("198");
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save Structure" }));
    const next = save.mock.calls[0][0] as StepAnswers;
    expect(next.stagePlans?.["Ladies A"][0].rrTopology?.mode).toBe("custom");
    expect(next.stagePlans?.["Ladies A"][0].rrTopology?.edges).toContainEqual([0, 0]);
    expect(answers().stagePlans?.["Ladies A"][0].rrTopology).toBeUndefined();
  });
  it("keeps unequal allocation and blocks invalid totals or stale group edges", () => {
    draw();
    fireEvent.click(screen.getByRole("button", { name: "Expand Ladies A" }));
    fireEvent.change(screen.getByLabelText("Ladies A stage 1 Pool A entries"), { target: { value: "5" } });
    expect((screen.getByRole("button", { name: "Save Structure" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Ladies A stage 1 Pool B entries"), { target: { value: "3" } });
    expect((screen.getByRole("button", { name: "Save Structure" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Between selected pools/groups · 95 matches" }));
    fireEvent.change(screen.getByLabelText("Ladies A stage 1 group count"), { target: { value: "2" } });
    expect(screen.getByLabelText("Structure issues").textContent).toContain("unavailable groups");
    expect((screen.getByRole("button", { name: "Save Structure" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("fails closed outside flagged Riverside preview new drafts", () => {
    const r = "11111111-1111-1111-1111-111111111111";
    expect(rowStructurePilot(r, true, "localhost")).toBe(true);
    expect(rowStructurePilot(r, false, "localhost")).toBe(false);
    expect(rowStructurePilot("uitsig", true, "localhost")).toBe(false);
    expect(rowStructurePilot(r, true, "squashhub.lovable.app")).toBe(true);
    expect(rowStructurePilot(r, true, "localhost", "live-tournament")).toBe(false);
  });
  it("counts selected singles and unique valid doubles pairs separately from expected entries", () => {
    const a = answers();
    a.picks = { x: ["Mens A", "Mens B"], y: ["Mens A"], z: ["Mens A"], w: ["Mens A"] };
    expect(selectedStructureEntries(a, "Mens A")).toBe(4);
    a.disc["Mens A"] = "doubles";
    a.pairs = { "Mens A": [["x", "y"], ["y", "x"], ["z", "w"], ["x", "z"]] };
    expect(selectedStructureEntries(a, "Mens A")).toBe(2);
    expect(a.unitEntries["Mens A"]).toBe("24");
  });
});
