import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwissProgressionPilotView } from "@/components/tournaments/SwissProgressionPilotView";
import { SwissCurrentPositionsTable } from "@/components/tournaments/SwissPositionGrid";
import { SwissPilotBoundary } from "@/components/tournaments/SwissPilotBoundary";
import { buildSwissProgression } from "@/lib/tournaments/swiss-progression-view";

const makeModel = (n = 8, saved = true) => buildSwissProgression({ seedOrder: Array.from({length:n}, (_,i) => `p${i+1}`), names:{p1:"Ann",p8:"Ben"}, totalRounds:3, matches:saved ? [{id:"m",round:1,a:"p1",b:"p8",winner:"p8",status:"completed",score:"3-1"}] : [] });
const classic = <div data-testid="classic-standings">Original colored standings</div>;
describe("Riverside optional classic standings", () => {
  it("hides colored table by default; offers reversible show/hide and factual positions/results", () => {
    render(<SwissProgressionPilotView title="Test" model={makeModel()} positionalPreview classicStandings={classic} />);
    expect(screen.queryByTestId("classic-standings")).toBeNull();
    expect(screen.queryByTestId("swiss-current-positions")).toBeNull(); // moved to Results tab
    fireEvent.click(screen.getByRole("button",{name:"Show classic standings"}));
    expect(screen.getByTestId("classic-standings")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Hide classic standings"}));
    expect(screen.queryByTestId("classic-standings")).toBeNull();
  });
  it.each([[5,true],[8,false],[0,false]])("classic fallback for unsupported or empty grid %i/%s", (n,saved) => {
    render(<SwissProgressionPilotView title="Test" model={makeModel(n,saved)} positionalPreview classicStandings={classic} />);
    expect(screen.getByTestId("classic-standings")).toBeTruthy();
  });
  it("legacy default still uses factual saved grid, not proposed/current-position columns", () => {
    render(<SwissProgressionPilotView title="Test" model={makeModel()} />);
    expect(screen.queryByTestId("swiss-current-positions")).toBeNull();
    expect(screen.getByRole("button",{name:"Grid"})).toBeTruthy();
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
});
