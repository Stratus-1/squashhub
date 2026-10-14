import { describe, it, expect } from "vitest";
import { swissTable, positionSwapOrder } from "@/lib/tournaments/swiss-standings";

const seeds = Array.from({ length: 24 }, (_, i) => `p${i + 1}`);

describe("positional Swiss (position_swap)", () => {
  it("winner from 24 takes spot 1, loser drops to 24", () => {
    const t = swissTable(seeds, [{ a: "p1", b: "p24", winner: "p24", round: 1 }, { a: "p2", b: "p23", winner: "p2", round: 1 }], ["position_swap"]);
    expect(t[0].id).toBe("p24");
    expect(t[23].id).toBe("p1");
    expect(t[1].id).toBe("p2");
  });
  it("higher-placed winner keeps spot; byes move nobody; rounds applied in order", () => {
    const o = positionSwapOrder(["a", "b", "c", "d"], [
      { a: "a", b: "b", winner: "b", round: 2 },
      { a: "a", b: "d", winner: "d", round: 1 },
      { a: "c", b: null, winner: null, round: 1 },
    ]);
    // R1: d takes a's spot -> d,b,c,a. R2: b beats a (a is lower) -> no move.
    expect(o).toEqual(["d", "b", "c", "a"]);
  });
  it("default Swiss is unchanged without the switch", () => {
    const t = swissTable(seeds, [{ a: "p1", b: "p24", winner: "p24" }]);
    expect(t[0].id).toBe("p24");
    expect(t[1].id).toBe("p1"); // old rule: loser sits 2nd on Buchholz
  });
});
