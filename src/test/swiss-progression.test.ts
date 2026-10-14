import { describe, it, expect } from "vitest";
import { progressionTable } from "@/lib/tournaments/swiss-progression";

const seeds = ["p1", "p2", "p3", "p4"];

describe("progressionTable", () => {
  it("position swap: lower seed winning swaps places and shows movement", () => {
    const t = progressionTable(seeds, [
      { a: "p1", b: "p4", winner: "p4", round: 1, score: "1-3" },
      { a: "p2", b: "p3", winner: "p2", round: 1, score: "3-0" },
      { a: "p4", b: "p2", winner: "p2", round: 2, score: "2-3" },
      { a: "p1", b: "p3", winner: "p3", round: 2, score: "0-3" },
    ], ["position_swap"]);
    expect(t.rows.map((r) => r.id)).toEqual(["p2", "p4", "p1", "p3"]);
    const p2 = t.rows.find((r) => r.id === "p2")!;
    expect(p2.movement).toBe(1);
    expect(t.rows.find((r) => r.id === "p4")!.cells[0]).toEqual({ kind: "result", opponent: "p1", won: true, score: "3-1" });
  });

  it("bye, pending and missing cells; no movement before a completed round", () => {
    const t = progressionTable(["a", "b", "c"], [
      { a: "a", b: null, winner: null, round: 1 },
      { a: "b", b: "c", winner: null, round: 1 },
    ]);
    const a = t.rows.find((r) => r.id === "a")!;
    expect(a.cells[0]).toEqual({ kind: "bye" });
    expect(a.played).toBe(0);
    expect(a.movement).toBeNull();
    expect(t.rows.find((r) => r.id === "b")!.cells[0]).toEqual({ kind: "pending", opponent: "c" });
  });

  it("withdrawn entrants go to the bottom", () => {
    const t = progressionTable(seeds, [{ a: "p1", b: "p2", winner: "p1", round: 1 }], null, new Set(["p1"]));
    expect(t.rows[t.rows.length - 1].id).toBe("p1");
    expect(t.rows[t.rows.length - 1].withdrawn).toBe(true);
  });
});
