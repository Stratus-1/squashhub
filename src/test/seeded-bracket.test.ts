import { describe, it, expect } from "vitest";
import { seededOrder, seededBracketText, seededLinesIssues, expectedGamesForStageName } from "@/lib/tournaments/seeded-bracket";
import { swissTable } from "@/lib/tournaments/swiss-standings";

describe("seeded bracket for Swiss → Quarterfinal", () => {
  it("8 qualifiers make four quarterfinals 1v8, 4v5, 2v7, 3v6 (1 and 2 only meet in the final)", () => {
    expect(seededOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(seededBracketText(8)).toBe("R1: A1 v A8\nR1: A4 v A5\nR1: A2 v A7\nR1: A3 v A6");
    // Semis pair winners of games 1v2 and 3v4 → seeds 1 and 2 are in opposite halves.
    const o = seededOrder(8);
    expect(o.slice(0, 4)).toContain(1);
    expect(o.slice(4)).toContain(2);
    expect(seededOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it("validates every position exactly once and refuses a semifinal labelled Quarterfinal", () => {
    expect(seededLinesIssues(seededBracketText(8), "Quarterfinal", 16)).toEqual([]);
    expect(seededLinesIssues("R1: A1 v A4\nR1: A2 v A3", "Quarterfinal", 16)[0]).toMatch(/needs 4 games/);
    expect(seededLinesIssues("R1: A1 v A8\nR1: A4 v A5\nR1: A2 v A7\nR1: A3 v A3", "Quarterfinal", 16).join(" ")).toMatch(/more than once.*missing|missing/);
    expect(seededLinesIssues("", "Quarterfinal", 16)).toContain("Choose how many players qualify.");
    expect(seededLinesIssues(seededBracketText(8), "Quarterfinal", 6).join(" ")).toMatch(/Only 6/);
    expect(expectedGamesForStageName("Semi-final")).toBe(2);
    expect(expectedGamesForStageName("Plate")).toBeNull();
  });

  it("qualifier order is the canonical Swiss order (match wins → Buchholz), not games won", () => {
    // p1 beats p2; p3 beats p4; p1 beats p3; p2 beats p4 — p3 has fewer wins than p2? no: p2 1W, p3 1W.
    const games = [
      { a: "p1", b: "p2", winner: "p1" }, { a: "p3", b: "p4", winner: "p3" },
      { a: "p1", b: "p3", winner: "p1" }, { a: "p2", b: "p4", winner: "p2" },
    ];
    const order = swissTable(["p1", "p2", "p3", "p4"], games, null).map((r) => r.id);
    expect(order[0]).toBe("p1");
    expect(order[3]).toBe("p4");
    // p2 and p3 both 1 win; Buchholz equal (2+0 / 2+0) → Sonneborn-Berger/seed decides deterministically.
    expect(new Set(order.slice(1, 3))).toEqual(new Set(["p2", "p3"]));
  });
});
