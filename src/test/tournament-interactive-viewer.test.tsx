import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TournamentInteractiveViewer, fitScale } from "@/components/tournaments/viewer/TournamentInteractiveViewer";
import { fetchClubBetaFeature } from "@/hooks/use-club-beta-feature";

describe("TournamentInteractiveViewer", () => {
  it("renders children and accessible toolbar controls", () => {
    render(<TournamentInteractiveViewer title="Demo"><p>dense content</p></TournamentInteractiveViewer>);
    expect(screen.getByText("dense content")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: /Demo view controls/ })).toBeInTheDocument();
    for (const n of ["Zoom in", "Zoom out", "Fit width", "Fit screen", "Actual size 100%", "Reset zoom", "Expand view"])
      expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
    expect(screen.getByText("100%", { selector: "span" })).toBeInTheDocument();
  });

  it("opens expanded mode and closes with Escape, returning focus", () => {
    render(<TournamentInteractiveViewer title="Demo" toolbarExtras={<button>Extra</button>}><p>x</p></TournamentInteractiveViewer>);
    fireEvent.click(screen.getByRole("button", { name: "Expand view" }));
    expect(screen.getByRole("dialog", { name: "Demo expanded" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close expanded view" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Extra" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand view" })).toHaveFocus();
  });

  it("fit maths: width vs screen, clamped", () => {
    expect(fitScale("width", { width: 500, height: 100 }, { width: 1000, height: 1000 })).toBe(0.5);
    expect(fitScale("screen", { width: 500, height: 100 }, { width: 1000, height: 1000 })).toBe(0.25);
    expect(fitScale("screen", { width: 50, height: 50 }, { width: 1000, height: 1000 })).toBe(0.25);
    expect(fitScale("width", { width: 5000, height: 50 }, { width: 100, height: 100 })).toBe(3);
  });
});

describe("club beta feature lookup fails closed", () => {
  const stub = (result: any, throws = false) => ((() => {
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => { if (throws) throw new Error("x"); return result; } };
    return q;
  }) as any);
  it("row present → on", async () => { expect(await fetchClubBetaFeature("c", "tournament_viewer_shell", stub({ data: { club_id: "c" }, error: null }))).toBe(true); });
  it("no row → off", async () => { expect(await fetchClubBetaFeature("c", "tournament_viewer_shell", stub({ data: null, error: null }))).toBe(false); });
  it("error → off", async () => { expect(await fetchClubBetaFeature("c", "tournament_viewer_shell", stub({ data: null, error: { message: "denied" } }))).toBe(false); });
  it("throw → off", async () => { expect(await fetchClubBetaFeature("c", "tournament_viewer_shell", stub(null, true))).toBe(false); });
});

import { nextWheelScale } from "@/components/tournaments/viewer/TournamentInteractiveViewer";
describe("wheel zoom maths", () => {
  it("scales by delta, normalises line mode, clamps at bounds", () => {
    expect(nextWheelScale(1, { deltaY: -100, deltaMode: 0 }, 0.25, 3)).toBeCloseTo(Math.exp(0.15));
    expect(nextWheelScale(1, { deltaY: 3, deltaMode: 1 }, 0.25, 3)).toBeCloseTo(nextWheelScale(1, { deltaY: 48, deltaMode: 0 }, 0.25, 3));
    expect(nextWheelScale(3, { deltaY: -500, deltaMode: 0 }, 0.25, 3)).toBe(3);
    expect(nextWheelScale(0.25, { deltaY: 500, deltaMode: 0 }, 0.25, 3)).toBe(0.25);
  });
});
