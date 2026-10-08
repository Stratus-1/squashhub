import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { guideEntryCounts, guideCountText } from "@/components/smart-builder/guide-entry-counts";
import { StructureGuidePanel } from "@/components/smart-builder/StructureGuidePanel";

describe("Structure guide entry totals", () => {
  const cats = ["Men", "Ladies"];
  const keys = ["Men::A", "Men::B", "Ladies"];
  const picks = { p1: ["Men::A", "Men::A"], p2: "Men::B", p3: ["Men::A", "Men::B"], unplaced: [] };
  const regs = [
    { club_member_id: "p1", partner_member_id: null, status: "confirmed", division_choices: [1] },
    { club_member_id: "p4", partner_member_id: null, status: "pending", division_choices: [2] },
    { club_member_id: "p5", partner_member_id: null, status: "withdrawn", division_choices: [1] },
  ];
  it("picks win over saved entries for the same player, excludes inactive registrations and sums children", () => {
    const c = guideEntryCounts(cats, keys, picks, regs);
    expect(c["Men::A"]).toEqual({ entered: 0, selected: 2, total: 2 });
    expect(c["Men::B"]).toEqual({ entered: 1, selected: 2, total: 3 });
    expect(c.Men).toEqual({ entered: 1, selected: 4, total: 5 });
    expect(c.Ladies.total).toBe(0);
  });
  it("shows categories and subcategories next to unchanged estimates", () => {
    render(<StructureGuidePanel cats={cats} guide={{ knowsEntries: true, expected: { Men: "12" } }} onChange={vi.fn()} isChamps unitOf={() => "players"} currentOf={() => undefined} onUse={vi.fn()} onOther={vi.fn()} subcats={{ Men: ["A", "B"] }} entryCounts={guideEntryCounts(cats, keys, picks, regs)} />);
    const row = within(screen.getByTestId("guide-count-Men"));
    expect(row.getByRole("spinbutton")).toHaveValue(12);
    expect(row.getByText("(1 entered · 4 selected · 5 total player entries)")).toBeInTheDocument();
    expect(row.getByText("(1 entered · 2 selected · 3 total player entries)")).toBeInTheDocument();
  });
  it("never pretends a failed registration read is zero entered", () => {
    expect(guideCountText({ entered: 0, selected: 3, total: 3 }, "error")).toContain("entered unavailable");
    expect(guideCountText(undefined, "loading")).toContain("loading");
  });
});