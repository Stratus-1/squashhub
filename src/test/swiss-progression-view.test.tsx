import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildSwissGrid, buildSwissProgression, movement, type ProgressionMatchInput } from "@/lib/tournaments/swiss-progression-view";
import { SwissProgressionPilotView } from "@/components/tournaments/SwissProgressionPilotView";

const names = { p1: "Ann", p2: "Ben", p3: "Cal", p4: "Dee", p5: "Eve" };
const seed = ["p1", "p2", "p3", "p4", "p5"];
const m = (id: string, round: number, a: string | null, b: string | null, winner: string | null, extra: Partial<ProgressionMatchInput> = {}): ProgressionMatchInput =>
  ({ id, round, a, b, winner, status: winner ? "completed" : "scheduled", ...extra });
const matches = [
  m("r1a", 1, "p1", "p5", "p5", { score: "3-1", court: "Court 2", date: "2026-10-20", time: "18:45:00" }),
  m("r1b", 1, "p2", "p4", "p2"),
  m("r1c", 1, "p3", null, null, { isBye: true, status: "completed" }),
  m("r2a", 2, "p5", "p2", null, { court: "Court 3", playBy: "2026-10-27" }),
  m("r2b", 2, null, null, null, { placeholderA: "Winner R1", placeholderB: null }),
];

describe("Swiss progression (read-only)", () => {
  const model = buildSwissProgression({ seedOrder: seed, names, matches, totalRounds: 3 });
  it("keeps every saved match as stored and adds undrawn future rounds", () => {
    expect(model.rounds.map((r) => [r.round, r.created, r.fixtures.length])).toEqual([[1, true, 3], [2, true, 2], [3, false, 0]]);
    expect(model.rounds[0].complete).toBe(true);
  });
  it("shows winners, losers, byes, date/court and unresolved opponents", () => {
    const [a, , bye] = model.rounds[0].fixtures;
    expect([a.winner, a.loser, a.court, a.when]).toEqual(["p5", "p1", "Court 2", "2026-10-20 18:45"]);
    expect([bye.state, bye.bLabel, bye.winner]).toEqual(["bye", "Bye", "p3"]);
    expect(model.rounds[1].fixtures[0].playBy).toBe("2026-10-27");
    expect(model.rounds[1].fixtures[1]).toMatchObject({ state: "awaiting_opponent", aLabel: "Winner R1", bLabel: "To be decided" });
  });
  it("player cells and per-round positions", () => {
    const eve = model.rows.find((r) => r.id === "p5")!;
    expect(eve.cells).toEqual(["W v Ann", "v Ben", "TBD"]);
    expect(eve.positions[0]).not.toBeNull();
    expect(eve.positions[2]).toBeNull();
    expect(model.rows.find((r) => r.id === "p3")!.cells[0]).toBe("Bye");
    expect(model.format).toBe("results_based");
  });
  it("does not mutate input matches", () => {
    const copy = JSON.parse(JSON.stringify(matches));
    buildSwissProgression({ seedOrder: seed, names, matches, totalRounds: 3 });
    expect(matches).toEqual(copy);
  });
  it("movement compares the two latest rounds with results", () => {
    expect(movement({ id: "x", name: "x", seed: 1, positions: [5, 2], cells: [], wins: 0, current: 2 })).toBe(3);
    expect(movement({ id: "x", name: "x", seed: 1, positions: [3, null], cells: [], wins: 0, current: 3 })).toBeNull();
  });
  it("renders labelled existing format, rounds and unresolved text", () => {
    render(<SwissProgressionPilotView title="Men's A" model={model} />);
    expect(screen.getByText(/Existing Swiss/)).toBeTruthy();
    expect(screen.getByTestId("swiss-position-grid")).toBeTruthy();
    expect(screen.getByText(/not moved into fixed slots/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Classic" }));
    expect(screen.getAllByText("Opponent to be decided").length).toBeGreaterThan(0);
    expect(screen.getByText(/Not drawn yet/)).toBeTruthy();
  });

  it("grid: 2-row blocks, seeds in round 1, TBD/bye and no re-pairing", () => {
    const g = buildSwissGrid(model);
    expect(g.map((r) => r.blocks.length)).toEqual([3, 2, 0]);
    const first = g[0].blocks[0];
    expect(first.rows.map((r) => [r.pos, r.name, r.result])).toEqual([[1, "Ann", "L"], [5, "Eve", "W"]]);
    expect(first.score).toBe("3-1");
    expect(g[0].blocks.find((b) => b.rows[1].name === "Bye")!.rows[0].result).toBe("Bye");
    const pending = g[1].blocks.find((b) => b.rows[0].id == null)!;
    expect(pending.rows.map((r) => r.name)).toEqual(["Winner R1", "To be decided"]);
    expect(g[1].blocks.flatMap((b) => b.rows.map((r) => r.id)).filter(Boolean).sort()).toEqual(["p2", "p5"]);
    expect(g[2].created).toBe(false);
  });
});
