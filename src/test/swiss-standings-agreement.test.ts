import { describe, expect, it } from "vitest";
import { swissTable, resolveSwissTieBreaks } from "@/lib/tournaments/swiss-standings";
import { nextSwissRound, swissStandings } from "@/lib/tournaments/engine-service";
import type { FixtureRow } from "@/lib/tournaments/contract";

// Riverside Men's A seed order (names as ids keep the test readable).
const SEEDS = ["AndrePretorius", "AndreMokoena", "BertusZulu", "AnikaMthembu", "BenjaminThompson", "WillemPretorius", "DylanCampbell", "HennieErasmus",
  "AlbertErasmus", "BonganiRadebe", "AndrePatel", "TianNaidoo", "KabeloPhillips", "TumiVenter", "MatthewNdlovu", "TshepoNaidoo"];
// Round 1 exactly as played: [a, b, winner, score]
const R1: Array<[string, string, string, string]> = [
  ["AndrePretorius", "AlbertErasmus", "AndrePretorius", "2-1"],
  ["AndreMokoena", "BonganiRadebe", "BonganiRadebe", "1-2"],
  ["BertusZulu", "AndrePatel", "AndrePatel", "0-2"],
  ["AnikaMthembu", "TianNaidoo", "TianNaidoo", "0-2"],
  ["BenjaminThompson", "KabeloPhillips", "BenjaminThompson", "2-0"],
  ["WillemPretorius", "TumiVenter", "WillemPretorius", "2-1"],
  ["DylanCampbell", "MatthewNdlovu", "DylanCampbell", "2-0"],
  ["HennieErasmus", "TshepoNaidoo", "TshepoNaidoo", "0-2"],
];

const stage = (tieBreaks?: any) => ({ id: "sw", order: 0, kind: "swiss", name: "Swiss rounds", swissRounds: 6, tieBreaks }) as any;
const division = (ids: string[], st = stage()) => ({ divisionId: "d1", label: "Men's A", unit: "players", entrants: ids.map((id) => ({ id })), stages: [st] }) as any;
const rowsOf = (games: Array<[string, string | null, string | null]>, round: number): FixtureRow[] =>
  games.map(([a, b, w], i) => ({ id: `r${round}-${i}`, divisionId: "d1", stageId: "sw", stageKind: "swiss", round, a, b, winner: w, status: "completed" }));

describe("Swiss standings = pairing order", () => {
  const r1 = rowsOf(R1.map(([a, b, w]) => [a, b, w]), 1);

  it("2-1 losers and 2-0 winners: points are match wins only, games never count", () => {
    const t = swissTable(SEEDS, R1.map(([a, b, w]) => ({ a, b, winner: w })));
    const pts = Object.fromEntries(t.map((r) => [r.id, r.points]));
    expect(pts.AndreMokoena).toBe(0); // lost 1-2 → still 0 Swiss points
    expect(pts.TumiVenter).toBe(0);
    expect(pts.AndrePretorius).toBe(1); // won 2-1 = same as a 2-0 win
    expect(pts.DylanCampbell).toBe(1);
    // Level winners are split by Buchholz (all 0 after R1), then Sonneborn-Berger, then original seed.
    expect(t.slice(0, 8).map((r) => r.id)).toEqual(["AndrePretorius", "BenjaminThompson", "WillemPretorius", "DylanCampbell", "BonganiRadebe", "AndrePatel", "TianNaidoo", "TshepoNaidoo"]);
    expect(t.slice(8).map((r) => r.id)).toEqual(["AndreMokoena", "BertusZulu", "AnikaMthembu", "HennieErasmus", "AlbertErasmus", "KabeloPhillips", "TumiVenter", "MatthewNdlovu"]);
  });

  it("the engine's standings and the page's table are the same order", () => {
    const page = swissTable(SEEDS, R1.map(([a, b, w]) => ({ a, b, winner: w }))).map((r) => r.id);
    const engine = swissStandings(division(SEEDS), stage(), r1).map((r) => r.id);
    expect(engine).toEqual(page);
  });

  it("Round 2 pairs down the standings table within score groups", () => {
    const next = nextSwissRound("t", division(SEEDS), "sw", r1);
    expect(next.map((f) => [f.a, f.b])).toEqual([
      ["AndrePretorius", "BenjaminThompson"], ["WillemPretorius", "DylanCampbell"], ["BonganiRadebe", "AndrePatel"], ["TianNaidoo", "TshepoNaidoo"],
      ["AndreMokoena", "BertusZulu"], ["AnikaMthembu", "HennieErasmus"], ["AlbertErasmus", "KabeloPhillips"], ["TumiVenter", "MatthewNdlovu"],
    ]);
    expect(next.every((f) => f.round === 2)).toBe(true);
  });

  it("avoids repeat opponents even when the table would pair them", () => {
    const ids = ["A", "B", "C", "D"];
    const rows = [...rowsOf([["A", "C", "A"], ["B", "D", "B"]], 1), ...rowsOf([["A", "B", "A"], ["C", "D", "C"]], 2)];
    const order = swissTable(ids, rows.map((r) => ({ a: r.a, b: r.b, winner: r.winner ?? null }))).map((r) => r.id);
    expect(order[0]).toBe("A");
    const next = nextSwissRound("t", division(ids, { ...stage(), swissRounds: 3 }), "sw", rows);
    const keys = next.map((f) => [f.a, f.b].sort().join("|"));
    for (const k of ["A|C", "B|D", "A|B", "C|D"]) expect(keys).not.toContain(k);
    expect(keys.sort()).toEqual(["A|D", "B|C"]);
  });

  it("a bye is a win worth 1 point that adds nothing to Buchholz", () => {
    const ids = ["A", "B", "C"];
    const rows = rowsOf([["A", "B", "A"], ["C", null, null]], 1);
    const t = swissTable(ids, rows.map((r) => ({ a: r.a, b: r.b, winner: r.a && !r.b ? null : r.winner ?? null })));
    const c = t.find((r) => r.id === "C")!;
    expect(c).toMatchObject({ points: 1, wins: 1, byes: 1, buchholz: 0, sonnebornBerger: 0 });
    // A beat B (0 pts): Buchholz 0, so A and C are level → original seed decides (A first).
    expect(t.map((r) => r.id)).toEqual(["A", "C", "B"]);
    expect(swissStandings(division(ids), stage(), rows).map((r) => r.id)).toEqual(t.map((r) => r.id));
  });

  it("Buchholz then Sonneborn-Berger then seed, with configurable order", () => {
    expect(resolveSwissTieBreaks(undefined)).toEqual(["buchholz", "sonneborn_berger", "seed"]);
    expect(resolveSwissTieBreaks(["sonneborn_berger", "buchholz", "seed"])).toEqual(["sonneborn_berger", "buchholz", "seed"]);
    expect(resolveSwissTieBreaks(["seed"])).toEqual(["seed"]);
    // After 2 rounds: A (2 pts) beat C and B; D beat... build a case where Buchholz separates level players.
    const ids = ["A", "B", "C", "D"];
    const games = [{ a: "A", b: "C", winner: "A" }, { a: "B", b: "D", winner: "D" }, { a: "A", b: "D", winner: "A" }, { a: "B", b: "C", winner: "C" }];
    // Points: A2, C1, D1, B0. C's opponents A(2)+B(0)=2, D's opponents B(0)+A(2)=2 → SB: C beat B(0)=0, D beat B(0)=0 → seed: C before D.
    expect(swissTable(ids, games).map((r) => r.id)).toEqual(["A", "C", "D", "B"]);
    expect(swissTable(ids, games, ["seed"]).map((r) => r.id)).toEqual(["A", "C", "D", "B"]);
  });
});
