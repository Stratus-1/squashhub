import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { parentProgressionGroups, parentFixtureLanes, parentProgressionEnabled } from "@/lib/tournaments/parent-progression";
import { ParentCategoryProgression } from "@/components/tournaments/ParentCategoryProgression";

const spec = { divisions: [1, 2].map((g) => ({ divisionId: `g${g}`, groupNumber: g, label: `Mens A › ${g} · Singles`, stages: [{ id: "main", name: "Round robin", kind: "round_robin", order: 0 }], deferredStages: [{ stageKey: "shared-final", name: "Final" }] })) };
const lifecycle = { answers: { subcats: { "Mens A": ["1", "2"] }, playoffSync: true }, format_plan: { playoffOverrides: { "Mens A": { choice: "playoffs", qualification: "top_pools", pairing: "later", style: "placement", rounds: 1 } } } };

describe("approved club-only parent progression", () => {
  it("uses explicit saved membership and deduplicates a deferred shared Final", () => {
    const before = JSON.stringify({ spec, lifecycle });
    expect(parentProgressionGroups(spec, lifecycle)).toEqual([{ label: "Mens A", groups: [1, 2], stages: [{ id: "shared-final", name: "Final", deferred: true, plannedDate: undefined }], qualification: "Top pool finishers · qualifier count not configured" }]);
    expect(JSON.stringify({ spec, lifecycle })).toBe(before);
    expect(spec.divisions.map((d) => d.stages[0].kind)).toEqual(["round_robin", "round_robin"]);
  });
  it("never infers parent associations or a shared bracket from names alone", () => {
    expect(parentProgressionGroups(spec, { ...lifecycle, answers: {} })).toEqual([]);
    expect(parentProgressionGroups(spec, { ...lifecycle, answers: { ...lifecycle.answers, playoffSync: false } })).toEqual([]);
    expect(parentProgressionGroups({ divisions: spec.divisions.slice(0, 1) }, lifecycle)).toEqual([]);
  });
  it("enables the approved club independently of hostname, never another club", () => {
    const id = "d8397b8a-60d3-4c4b-afee-25dab218bf19";
    expect(parentProgressionEnabled(id)).toBe(true);
    expect(parentProgressionEnabled("11111111-1111-1111-1111-111111111111")).toBe(false);
    expect(parentProgressionEnabled(undefined)).toBe(false);
  });
  it("keeps each fixture in one lane, retains IDs, and orders rounds", () => {
    const parent = parentProgressionGroups(spec, lifecycle)[0];
    const r1 = { id: "a", group_number: 1, stage: "group", stage_key: "main", round_number: 1 };
    const input = [{ ...r1, id: "b", round_number: 2 }, r1, r1, { id: "c", group_number: 2, stage: "group", stage_key: "main" }, { id: "f", group_number: 1, stage: "ko", stage_key: "shared-final" }, { id: "other", group_number: 3, stage: "group" }];
    const before = JSON.stringify(input);
    const lanes = parentFixtureLanes(parent, input);
    expect(lanes.children.get(1)?.map((m) => m.id)).toEqual(["a", "b"]);
    expect(lanes.children.get(2)?.map((m) => m.id)).toEqual(["c"]);
    expect(lanes.playoffs.map((m) => m.id)).toEqual(["f"]);
    expect(JSON.stringify(input)).toBe(before);
  });
  it("shows both children on both views, one Final, and no invented participants or stages", () => {
    const parent = parentProgressionGroups(spec, lifecycle)[0];
    const fixture = { id: "saved", round: 1, a: "Ann", b: "Ben", score: null, when: "Court 1 · 18:00", deadline: "2026-10-19", status: "To play" };
    const { container } = render(<ParentCategoryProgression parent={parent} playoffs={[]} children={[1, 2].map((g) => ({ group: g, label: `A${g}`, format: "Round robin", matrix: null, standings: <div>Rankings {g}</div>, upcoming: g === 1 ? [fixture] : [], results: [] }))} />);
    expect(screen.getByRole("region", { name: "A1" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "A2" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: /^Final$/ })).toHaveLength(1);
    expect(screen.queryByText("Semifinals")).toBeNull();
    expect(screen.getByText("Participants TBD")).toBeTruthy();
    expect(container.querySelectorAll('[data-fixture-id="saved"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "Log View" }));
    expect(screen.getByText("Rankings 1")).toBeTruthy();
    expect(screen.getByText("Rankings 2")).toBeTruthy();
    expect(container.querySelectorAll('[data-fixture-id="saved"]')).toHaveLength(1);
  });
});