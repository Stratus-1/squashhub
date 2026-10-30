import { describe, it, expect } from "vitest";
import { buildPlayoffChain } from "@/lib/smart-builder/playoff-chain";

const main: any = { id: "v-s1", order: 1, kind: "round_robin", name: "Pools", discipline: "singles", poolMembers: [Array(7).fill("x"), Array(7).fill("y")] };
const plan: any = { mode: "scheduled", date: "2026-10-31", from: "12:00", to: "16:00", pairing: "crossover", trigger: "auto" };

describe("two-pool bottom half playoffs", () => {
  it("semis with 4 per pool: A1vB2, B1vA2, A3vB4, B3vA4; final round pairs top and bottom winners", () => {
    const r = buildPlayoffChain(main, "v", [{ name: "Semifinal", plan }, { name: "Final", plan: { ...plan, pairing: "winners" } }], { bottomHalf: true, qualifiers: { perPool: 4, runnersUp: 0 } });
    expect(r.reason).toBeNull();
    const m = r.stages[0].mapping!.matches.map((x) => `${x.a}v${x.b}`);
    expect(m).toEqual(["A1vB2", "B1vA2", "A3vB4", "B3vA4"]);
    expect(r.stages[1].mapping!.matches.length).toBe(2);
  });
});
