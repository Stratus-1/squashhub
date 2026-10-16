import { describe, it, expect } from "vitest";
import { buildPlayoffChain } from "@/lib/smart-builder/playoff-chain";
describe("two pools + seeded play-offs start automatically", () => {
  it("QF/SF/Final after 2 pools of 4 builds a real chain", () => {
    const plan = { pairing: "seeded", mode: "scheduled", date: "2026-11-14", from: "10:00", to: "14:00", deadline: null, courtIds: [20], trigger: "auto" } as any;
    const main = { id: "m", order: 0, kind: "pools", pools: 2, poolMembers: [["a1","a2","a3","a4"],["b1","b2","b3","b4"]] } as any;
    const r = buildPlayoffChain(main, "v", [{ name: "Quarterfinal", plan }, { name: "Semifinal", plan: { ...plan, pairing: "later" } }, { name: "Final", plan: { ...plan, pairing: "later" } }]);
    expect(r.reason).toBeNull();
    expect(r.stages).toHaveLength(3);
  });
});
