import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { buildRoundRobinView } from "@/lib/tournaments/round-robin-view";
import { RoundRobinCleanView } from "@/components/tournaments/RoundRobinPilotView";

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
describe("Riverside standalone round robin clean view", () => {
  it("drags the round track without changing saved fixtures or results", () => {
    const view = buildRoundRobinView({ players: players(4), matches: [
      { id: "drag-result", round: 1, a: "p1", b: "p4", winner: "p1", status: "completed", score: "3-1" },
    ] as any });
    const before = JSON.stringify(view);
    render(<RoundRobinCleanView view={view} group={1} groupLabel="Pool A" />);
    const track = screen.getByTestId("rr-round-track");
    track.setPointerCapture = vi.fn();
    track.hasPointerCapture = vi.fn(() => true);
    track.releasePointerCapture = vi.fn();
    const pointer = (type: string, x: number, target: Element = track) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { pointerType: { value: "mouse" }, button: { value: 0 }, pointerId: { value: 7 }, clientX: { value: x } });
      fireEvent(target, event);
    };
    pointer("pointerdown", 300);
    pointer("pointermove", 180);
    expect(track.scrollLeft).toBe(120);
    pointer("pointerup", 180);
    pointer("pointermove", 100);
    expect(track.scrollLeft).toBe(120);
    expect(JSON.stringify(view)).toBe(before);
    const back = within(screen.getByTestId("rr-clean-standings")).getByRole("button", { name: "← Back to Rounds" });
    pointer("pointerdown", 300, back);
    pointer("pointermove", 100);
    expect(track.scrollLeft).toBe(120);
  });
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
