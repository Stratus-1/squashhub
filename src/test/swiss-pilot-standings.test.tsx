import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwissProgressionPilotView } from "@/components/tournaments/SwissProgressionPilotView";
import { SwissCurrentPositionsTable, SwissPositionGrid } from "@/components/tournaments/SwissPositionGrid";
import { SwissPilotBoundary } from "@/components/tournaments/SwissPilotBoundary";
import { buildSwissProgression } from "@/lib/tournaments/swiss-progression-view";

const makeModel = (n = 8, saved = true) => buildSwissProgression({ seedOrder: Array.from({length:n}, (_,i) => `p${i+1}`), names:{p1:"Ann",p8:"Ben"}, totalRounds:3, matches:saved ? [{id:"m",round:1,a:"p1",b:"p8",winner:"p8",status:"completed",score:"3-1"}] : [] });
const classic = <div data-testid="classic-standings">Original colored standings</div>;
describe("Riverside optional classic standings", () => {
  it("hides colored table by default; offers reversible show/hide and factual positions/results", () => {
    render(<SwissProgressionPilotView title="Test" model={makeModel()} positionalPreview classicStandings={classic} />);
    expect(screen.queryByTestId("classic-standings")).toBeNull();
    expect(screen.queryByTestId("swiss-current-positions")).toBeNull(); // moved to Results tab
    fireEvent.click(screen.getByRole("tab",{name:"Log View"}));
    expect(screen.getByTestId("classic-standings")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab",{name:"Positional Preview"}));
    expect(screen.queryByTestId("classic-standings")).toBeNull();
  });
  it.each([[5,true],[8,false],[0,false]])("classic fallback for unsupported or empty grid %i/%s", (n,saved) => {
    render(<SwissProgressionPilotView title="Test" model={makeModel(n,saved)} positionalPreview classicStandings={classic} />);
    expect(screen.getByTestId("classic-standings")).toBeTruthy();
  });
  it("legacy default still uses factual saved grid, not proposed/current-position columns", () => {
    render(<SwissProgressionPilotView title="Test" model={makeModel()} />);
    expect(screen.queryByTestId("swiss-current-positions")).toBeNull();
    expect(screen.getByRole("tab",{name:"Grid"})).toBeTruthy();
  });
  it("render errors fall back to original standings", () => {
    const error = vi.spyOn(console,"error").mockImplementation(() => {});
    const Broken = () => { throw new Error("Grid failed"); };
    render(<SwissPilotBoundary fallback={classic}><Broken /></SwissPilotBoundary>);
    expect(screen.getByTestId("classic-standings")).toBeTruthy();
    error.mockRestore();
  });
  it("Results-tab table shows factual live score-based positions", () => {
    render(<SwissCurrentPositionsTable model={makeModel()} />);
    const t = screen.getByTestId("swiss-current-positions").textContent ?? "";
    expect(t).toContain("W v Ann"); expect(t).toContain("live score-based standings");
  });
  it("one three-tab bar, no duplicate classic button; calendar separates saved vs proposed", () => {
    render(<SwissProgressionPilotView title="Test" model={makeModel(8)} positionalPreview classicStandings={classic} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Positional Preview", "Log View", "Calendar View"]);
    expect(screen.getByRole("tab", { name: "Positional Preview" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("button", { name: /classic standings/i })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Calendar View" }));
    const cal = screen.getByTestId("swiss-calendar");
    expect(cal.querySelector('[data-testid="fixture-calendar"]')).toBeTruthy();
    expect(cal.textContent).toContain("Proposed slot");
  });
});

describe("Final standing column", () => {
  const fullModel = () => buildSwissProgression({ seedOrder: ["p1","p2","p3","p4"], names: {p1:"Ann",p2:"Ben",p3:"Cid",p4:"Dee"}, totalRounds: 2, matches: [
    {id:"m1",round:1,a:"p1",b:"p2",winner:"p1",status:"completed",score:"3-0"},
    {id:"m2",round:1,a:"p3",b:"p4",winner:"p3",status:"completed",score:"3-0"},
    {id:"m3",round:2,a:"p1",b:"p3",winner:"p1",status:"completed",score:"3-1"},
    {id:"m4",round:2,a:"p2",b:"p4",winner:"p2",status:"completed",score:"3-1"},
  ]});
  it("shows dashes until every round is complete, then locked final positions", () => {
    const partial = makeModel(); // only round 1 of 3 played
    const { unmount } = render(<SwissCurrentPositionsTable model={partial} />);
    expect(screen.getByTestId("swiss-current-positions").textContent).toContain("Final standing");
    expect(screen.getByTestId("swiss-final-standing-p1").textContent).toBe("—");
    unmount();
    render(<SwissCurrentPositionsTable model={fullModel()} />);
    expect(screen.getByTestId("swiss-current-positions").textContent).toContain("Final standings");
    expect(screen.getByTestId("swiss-final-standing-p1").textContent).toBe("1");
    expect(screen.getByTestId("swiss-final-standing-p4").textContent).toBe("4");
  });
});

describe("Final standing with a follow-up stage", () => {
  it("locks once the Swiss rounds are done, even while later stage games are unplayed", () => {
    const m = buildSwissProgression({ seedOrder: ["p1","p2","p3","p4"], names: {p1:"Ann",p2:"Ben",p3:"Cid",p4:"Dee"}, totalRounds: 2, matches: [
      {id:"m1",round:1,a:"p1",b:"p2",winner:"p1",status:"completed",score:"3-0"},
      {id:"m2",round:1,a:"p3",b:"p4",winner:"p3",status:"completed",score:"3-0"},
      {id:"m3",round:2,a:"p1",b:"p3",winner:"p1",status:"completed",score:"3-1"},
      {id:"m4",round:2,a:"p2",b:"p4",winner:"p2",status:"completed",score:"3-1"},
      {id:"m5",round:3,a:"p1",b:"p4",winner:null,status:"scheduled"}, // follow-up stage, unplayed
    ]});
    render(<SwissCurrentPositionsTable model={m} />);
    expect(screen.getByTestId("swiss-final-standing-p1").textContent).toBe("1");
  });
});

describe("Grid final-standing card", () => {
  it("shows a Projected card after the last round while rounds are unfinished, Locked once complete", () => {
    const { unmount } = render(<SwissPositionGrid model={makeModel()} />);
    const card = screen.getByTestId("swiss-final-standing-card");
    expect(card.textContent).toContain("Current standings");
    expect(card.textContent).not.toContain("Final standing");
    expect(card.textContent).toContain("Projected");

    unmount();
    render(<SwissPositionGrid model={buildSwissProgression({ seedOrder: ["p1","p2","p3","p4"], names: {p1:"Ann",p2:"Ben",p3:"Cid",p4:"Dee"}, totalRounds: 2, matches: [
      {id:"m1",round:1,a:"p1",b:"p2",winner:"p1",status:"completed",score:"3-0"},
      {id:"m2",round:1,a:"p3",b:"p4",winner:"p3",status:"completed",score:"3-0"},
      {id:"m3",round:2,a:"p1",b:"p3",winner:"p1",status:"completed",score:"3-1"},
      {id:"m4",round:2,a:"p2",b:"p4",winner:"p2",status:"completed",score:"3-1"},
    ]})} />);
    const locked = screen.getByTestId("swiss-final-standing-card");
    expect(locked.textContent).toContain("Locked");
    expect(locked.textContent).toContain("seed the next stage");
  });
});
