import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { rrFinishStandings } from "@/lib/tournaments/swiss-rr-standings";
import { SwissRrFinishStandings } from "@/components/tournaments/SwissRrFinishStandings";

const snap = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const gs = () => ({ sets: null, pointsKnown: false });
describe("Riverside live RR standings panel", () => {
  it("18 players/3 groups: three tables, remainder 13–18 never shown, unplayed group shows dashes", () => {
    const groups = rrFinishStandings({ snapshot: snap(18), groups: 3, criteria: ["wins"] as any, gameSets: gs,
      matches: [{ a: "p1", b: "p4", winner: "p4", round: 3, status: "completed" }, { a: "p13", b: "p14", winner: "p13", round: 3, status: "completed" }, { a: "p1", b: "p2", winner: "p1", round: 2, status: "completed" }] });
    render(<SwissRrFinishStandings groups={groups} fromRound={3} />);
    expect(screen.getAllByTestId(/^rr-group-/)).toHaveLength(3);
    expect(screen.queryByTestId("rr-row-p13")).toBeNull();
    expect(within(screen.getByTestId("rr-row-p4")).getAllByRole("cell")[0].textContent).toBe("1");
    expect(within(screen.getByTestId("rr-row-p4")).getAllByRole("cell")[1].textContent).toBe("4");
    expect(within(screen.getByTestId("rr-row-p5")).getAllByRole("cell")[0].textContent).toBe("—");
    expect(within(screen.getByTestId("rr-row-p2")).getAllByRole("cell")[3].textContent).toBe("0"); // R2 game not counted
  });
  it("16 players/4 groups: all four group tables", () => {
    render(<SwissRrFinishStandings groups={rrFinishStandings({ snapshot: snap(16), groups: 4, criteria: ["wins"] as any, gameSets: gs, matches: [] })} fromRound={3} />);
    expect(screen.getAllByTestId(/^rr-group-/)).toHaveLength(4);
  });
});
