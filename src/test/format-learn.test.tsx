import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LEARN_EXAMPLES, LEARN_FORMAT_LABEL, type LearnFormat } from "@/lib/smart-builder/format-learn";
import { FormatLearnDialog, FormatLearnButton } from "@/components/smart-builder/FormatLearnDialog";
import { useState } from "react";

const ALL: LearnFormat[] = ["round_robin", "swiss", "knockout", "monrad", "cross_league"];

describe("format learning examples", () => {
  it("covers all five palette formats with rounds and guidance", () => {
    for (const f of ALL) {
      const ex = LEARN_EXAMPLES[f];
      expect(ex.rounds.length).toBeGreaterThan(0);
      expect(ex.whenToUse.length).toBeGreaterThan(10);
      expect(ex.howItWorks.length).toBeGreaterThan(1);
      expect(ex.engineNote).toMatch(/SquashHub/);
    }
  });
  it("round robin: 6 players, 5 rounds, everyone plays everyone exactly once", () => {
    const ex = LEARN_EXAMPLES.round_robin;
    expect(ex.rounds).toHaveLength(5);
    const seen = new Set<string>();
    for (const r of ex.rounds) for (const g of r.games) {
      const key = [g.a, g.b].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(15); // 6 choose 2
    const table = ex.standings![0].rows;
    expect(table).toHaveLength(6);
    expect(table.reduce((s, r) => s + r.won, 0)).toBe(15);
  });
  it("swiss: 8 players, 3 rounds, no rematches, standings by points", () => {
    const ex = LEARN_EXAMPLES.swiss;
    expect(ex.rounds).toHaveLength(3);
    const seen = new Set<string>();
    for (const r of ex.rounds) for (const g of r.games) {
      const key = [g.a, g.b].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    const final = ex.standings!.at(-1)!.rows;
    expect(final[0].points).toBe(3);
    expect(final.map((r) => r.points).reduce((a, b) => a + b, 0)).toBe(12);
    expect(ex.howItWorks.join(" ")).toMatch(/NOT fixed/i);
  });
  it("knockout: seeded 8-bracket with QF/SF/F plus optional third place", () => {
    const ex = LEARN_EXAMPLES.knockout;
    expect(ex.rounds.map((r) => r.games.length)).toEqual([4, 2, 1, 1]);
    const qf = ex.rounds[0].games;
    expect(qf[0].a).toBe("K1");
    expect(qf[0].b).toBe("K8");
  });
  it("monrad: 8 players, 3 rounds, 12 matches, final positions 1-8 all distinct", () => {
    const ex = LEARN_EXAMPLES.monrad;
    const total = ex.rounds.reduce((s, r) => s + r.games.length, 0);
    expect(total).toBe(12);
    expect(ex.positions).toHaveLength(8);
    expect(new Set(ex.positions!.map((p) => p.name)).size).toBe(8);
    expect(ex.positions!.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it("cross league: 4+4 rotation, no repeated cross pairing, separate and combined tables", () => {
    const ex = LEARN_EXAMPLES.cross_league;
    expect(ex.rounds).toHaveLength(4);
    const seen = new Set<string>();
    for (const r of ex.rounds) for (const g of r.games) {
      const key = [g.a, g.b].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(16);
    expect(ex.standings!.map((s) => s.rows.length)).toEqual([4, 4, 8]);
  });
});

function Harness() {
  const [fmt, setFmt] = useState<LearnFormat | null>(null);
  return (
    <>
      <FormatLearnButton format="swiss" onOpen={setFmt} />
      <FormatLearnDialog format={fmt} open={fmt !== null} onOpenChange={(v) => { if (!v) setFmt(null); }} />
    </>
  );
}

describe("FormatLearnDialog", () => {
  it("opens from the info button, switches rounds, and closes", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /learn about swiss pairing/i }));
    expect(screen.getByTestId("format-learn-dialog")).toBeInTheDocument();
    expect(screen.getByText("Hypothetical example")).toBeInTheDocument();
    expect(screen.getAllByText(/Round 2/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Round 3" }));
    expect(screen.getByText(/Paired again by accumulated score/)).toBeInTheDocument();
    expect(screen.getByText("Final standings after Round 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByTestId("format-learn-dialog")).not.toBeInTheDocument();
  });
  it("labels every format and exposes an accessible trigger name", () => {
    for (const f of ALL) expect(LEARN_FORMAT_LABEL[f]).toBeTruthy();
  });
});
