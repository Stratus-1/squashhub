import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { buildRoundRobinView } from "@/lib/tournaments/round-robin-view";
import { RoundRobinCleanView, RoundRobinCombinedCleanView, RoundRobinPilotView } from "@/components/tournaments/RoundRobinPilotView";

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
describe("Riverside standalone round robin clean view", () => {
  it("keeps saved inputs unchanged when results refresh through the standard view", () => {
    const matches = [{ id: "standard", round: 1, a: "p1", b: "p2", status: "scheduled", winner: null as string | null, score: null as string | null }];
    const before = JSON.stringify(matches);
    const make = (input: typeof matches) => buildRoundRobinView({ players: players(2), matches: input });
    const { rerender } = render(<RoundRobinPilotView title="Club tournament" view={make(matches)} />);
    expect(within(screen.getByTestId("rr-clean-row-p1")).getAllByRole("cell")[3].textContent).toBe("0");
    rerender(<RoundRobinPilotView title="Club tournament" view={make([{ ...matches[0], status: "completed", winner: "p1", score: "3-1" }])} />);
    expect(within(screen.getByTestId("rr-clean-row-p1")).getAllByRole("cell").slice(3, 6).map(c => c.textContent)).toEqual(["1", "1", "0"]);
    expect(JSON.stringify(matches)).toBe(before);
  });
  it("zooms the shared viewer without changing saved fixtures or results", async () => {
    const view = buildRoundRobinView({ players: players(4), matches: [
      { id: "drag-result", round: 1, a: "p1", b: "p4", winner: "p1", status: "completed", score: "3-1" },
    ] as any });
    const before = JSON.stringify(view);
    render(<RoundRobinCleanView view={view} group={1} groupLabel="Pool A" />);
    // The round track and standings stay inside one shared zoom/pan shell (wheel, pinch or buttons).
    expect(screen.getByTestId("rr-round-track")).toBeInTheDocument();
    expect(within(screen.getByTestId("rr-clean-fixtures")).getByTestId("rr-clean-round-1")).toBeInTheDocument();
    const readout = screen.getByText("100%", { selector: "span" });
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await waitFor(() => expect(readout.textContent).not.toBe("100%"), { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    await waitFor(() => expect(readout.textContent).toBe("100%"), { timeout: 3000 });
    // The jump controls are still there and only move the view.
    expect(within(screen.getByTestId("rr-clean-standings")).getByRole("button", { name: "← Back to Rounds" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Standings →" }));
    expect(JSON.stringify(view)).toBe(before);
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
  it("two pools share one round table and one standings table, colour-banded per pool", () => {
    const mk = (ids: string[], tag: string) => buildRoundRobinView({
      players: ids.map((id, i) => ({ id, name: `${tag} Player ${i + 1}` })),
      matches: [{ id: `${tag}-m`, round: 1, a: ids[0], b: ids[1], winner: ids[0], status: "completed", score: "3-1" }] as any,
    });
    const a = mk(["a1", "a2"], "A");
    const b = mk(["b1", "b2"], "B");
    const before = JSON.stringify([a, b]);
    render(<RoundRobinCombinedCleanView pools={[{ view: a, group: 1, groupLabel: "Pool A" }, { view: b, group: 2, groupLabel: "Pool B" }]} />);
    const round = screen.getByTestId("rr-clean-round-1");
    // One table per round holds both pools, each introduced by its coloured label row.
    expect(within(round).getByText("Pool A")).toBeInTheDocument();
    expect(within(round).getByText("Pool B")).toBeInTheDocument();
    expect(within(round).getByText("A Player 1")).toBeInTheDocument();
    expect(within(round).getByText("B Player 1")).toBeInTheDocument();
    expect(within(round).getByText("Pool A").closest("tr")!.getAttribute("data-rr-group")).toBe("1");
    expect(within(round).getByText("Pool B").closest("tr")!.getAttribute("data-rr-group")).toBe("2");
    // One shared standings table keeps each pool's own ranking and pool column.
    const standings = screen.getByTestId("rr-clean-standings");
    expect(within(standings).getAllByRole("columnheader").map((c) => c.textContent)).toContain("Pool");
    expect(screen.getByTestId("rr-clean-row-a1").getAttribute("data-rr-group")).toBe("1");
    expect(screen.getByTestId("rr-clean-row-b1").getAttribute("data-rr-group")).toBe("2");
    expect(within(screen.getByTestId("rr-clean-row-a1")).getAllByRole("cell").slice(0, 4).map((c) => c.textContent)).toEqual(["Pool A", "1", "1", "A Player 1"]);
    // Display only: inputs untouched.
    expect(JSON.stringify([a, b])).toBe(before);
  });
});
