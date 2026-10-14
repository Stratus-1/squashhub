import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwissPositionGrid } from "@/components/tournaments/SwissPositionGrid";
import { buildSwissProgression } from "@/lib/tournaments/swiss-progression-view";

const model = buildSwissProgression({
  seedOrder: ["p1", "p2", "p3", "p4"], names: { p1: "Ann", p2: "Bea", p3: "Cat", p4: "Dee" }, totalRounds: 3,
  matches: [
    { id: "m1", round: 1, a: "p1", b: "p4", winner: "p1", status: "completed", score: "3-0", date: "2026-11-04", time: "18:00" },
    { id: "m2", round: 1, a: "p2", b: "p3", winner: null, status: "scheduled", playBy: "2026-11-11" },
  ],
});

describe("Swiss grid visuals (display only)", () => {
  it("round and match statuses: completed, upcoming, unresolved", () => {
    render(<SwissPositionGrid model={model} />);
    expect(screen.getByTestId("swiss-round-1").getAttribute("data-status")).toBe("in_progress");
    const st = [...screen.getByTestId("swiss-round-1").querySelectorAll("tbody")].map((t) => t.getAttribute("data-status"));
    expect(st).toEqual(expect.arrayContaining(["completed", "upcoming"]));
    expect(screen.getByTestId("swiss-round-3").getAttribute("data-status")).toBe("unresolved");
  });
  it("play-by tag is distinct from saved times", () => {
    const { container } = render(<SwissPositionGrid model={model} />);
    expect(container.querySelector('[data-when="playby"]')).toBeTruthy();
  });
  it("tap highlights only known rows for that player, persists, and clears", () => {
    const { container } = render(<SwissPositionGrid model={model} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Ann" })[0]);
    expect(screen.getByTestId("swiss-path-selected").textContent).toContain("Ann");
    const on = container.querySelectorAll('[data-path="on"]');
    expect(on.length).toBeGreaterThan(0);
    on.forEach((r) => expect(r.textContent).toContain("Ann")); // never a TBD row
    fireEvent.click(screen.getByRole("button", { name: "Clear highlight" }));
    expect(container.querySelectorAll('[data-path="on"]').length).toBe(0);
  });
});
