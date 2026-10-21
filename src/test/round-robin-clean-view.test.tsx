import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { buildRoundRobinView } from "@/lib/tournaments/round-robin-view";
import { RoundRobinCleanView } from "@/components/tournaments/RoundRobinPilotView";

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
describe("Riverside standalone round robin clean view", () => {
  it("shows every round's pairings from the draw, fixed positions, and live rank from results", () => {
    const view = buildRoundRobinView({ players: players(4), rankOrder: ["p4", "p1", "p2", "p3"], seedOrder: ["p1", "p2", "p3", "p4"], matches: [
      { id: "a", round: 1, a: "p1", b: "p4", winner: "p4", status: "completed", score: "0-3" },
      { id: "b", round: 1, a: "p2", b: "p3", winner: null, status: "scheduled" },
      { id: "c", round: 2, a: "p1", b: "p3", winner: null, status: "scheduled" },
      { id: "d", round: 3, a: "p1", b: "p2", winner: null, status: "scheduled" },
    ] as any });
    render(<RoundRobinCleanView view={view} group={2} groupLabel="Pool B" />);
    expect(screen.getByTestId("rr-clean-round-3")).toBeTruthy();
    const row = screen.getByTestId("rr-clean-row-p4");
    expect(row.getAttribute("data-rr-group")).toBe("2");
    expect(within(row).getAllByRole("cell").map((c) => c.textContent).slice(0, 5)).toEqual(["1", "4", "Player 4", "1", "1"]);
  });
  it("5 players: byes shown in the round, not counted as games", () => {
    const view = buildRoundRobinView({ players: players(5), matches: [
      { id: "x", round: 1, a: "p5", b: null, isBye: true, winner: null, status: "completed" },
      { id: "y", round: 1, a: "p1", b: "p2", winner: null, status: "scheduled" },
    ] as any });
    render(<RoundRobinCleanView view={view} group={1} groupLabel="Group 1" />);
    expect(within(screen.getByTestId("rr-clean-round-1")).getAllByText("Bye").length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("rr-clean-row-p5")).getAllByRole("cell")[3].textContent).toBe("0");
  });
});
