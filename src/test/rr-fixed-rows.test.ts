import { describe, it, expect } from "vitest";
import { buildRoundRobinView, rrSeedOrder } from "@/lib/tournaments/round-robin-view";
const players = ["p1","p2","p3","p4"].map((id) => ({ id, name: id }));
const ms = [
  { id: "a", round: 1, a: "p1", b: "p4", winner: "p4", score: "0-3", status: "completed" },
  { id: "b", round: 1, a: "p2", b: "p3", winner: null, score: null, status: "scheduled" },
] as any[];
describe("round robin rows stay fixed", () => {
  it("keeps draw order while rank moves", () => {
    const seed = rrSeedOrder(ms, []);
    expect(seed).toEqual(["p1","p2","p3","p4"]);
    const v = buildRoundRobinView({ players, matches: ms, seedOrder: seed, rankOrder: ["p4","p1","p2","p3"] });
    expect(v.players.map((p) => p.id)).toEqual(["p1","p2","p3","p4"]);
    expect(v.rank.p4).toBe(1);
    expect(v.complete).toBe(false);
  });
});
