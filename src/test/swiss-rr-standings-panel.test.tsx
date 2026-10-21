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

import { SwissPositionGrid } from "@/components/tournaments/SwissPositionGrid";
describe("Swiss+RR standings column placement", () => {
  it("renders the standings column after the last round inside the same track", () => {
    const model: any = { rows: [], rounds: [], totalRounds: 5, format: "positional", swissStageComplete: false };
    const { container } = render(<SwissPositionGrid model={model} proposedRounds={[1, 2, 3, 4, 5].map((r) => ({ round: r, created: false, blocks: [] })) as any} afterRounds={<section data-testid="rr-standings-column" />} />);
    const ids = [...container.querySelectorAll("[data-testid^=swiss-round-], [data-testid=rr-standings-column]")].map((e) => e.getAttribute("data-testid"));
    expect(ids).toEqual(["swiss-round-1", "swiss-round-2", "swiss-round-3", "swiss-round-4", "swiss-round-5", "rr-standings-column"]);
  });
});

describe("RR standings overall rank", () => {
  it("group 2 ranks continue from 5", () => {
    const groups = rrFinishStandings({ snapshot: snap(16), groups: 4, criteria: ["wins"] as any, gameSets: gs, matches: [{ a: "p5", b: "p6", winner: "p6", round: 3, status: "completed" }] });
    render(<SwissRrFinishStandings groups={groups} fromRound={3} />);
    expect(within(screen.getByTestId("rr-row-p6")).getAllByRole("cell")[0].textContent).toBe("5");
    expect(within(screen.getByTestId("rr-row-p5")).getAllByRole("cell")[0].textContent).toBe("6");
  });
});
