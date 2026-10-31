import { describe, expect, it } from "vitest";
import { twoPoolFinalRanking, type PlacementResult, type PoolFinish } from "@/lib/tournaments/two-pool-final-ranking";

const pools = (): PoolFinish[][] => ["a", "b"].map(prefix => Array.from({ length: 7 }, (_, i) => ({
  id: `${prefix}${i + 1}`, gameDiff: prefix === "a" ? 5 : 6, pointsDiff: prefix === "a" ? 20 : 10,
})));
const game = (label: string, a: string, b: string, winner: string): PlacementResult => ({ label, a, b, winner, status: "completed", stage: "playoff" });
const results = () => [
  game("Semifinal 1", "a1", "b2", "a1"), game("Semifinal 2", "b1", "a2", "b1"),
  game("Semifinal 3 (5th–8th)", "a3", "b4", "a3"), game("Semifinal 4 (5th–8th)", "b3", "a4", "b3"),
  game("Final", "a1", "b1", "a1"), game("5th place final", "a3", "b3", "a3"),
];
describe("two-pool final rankings", () => {
  it("ranks all 14 with finals authoritative and tied pairs separated by pool game difference", () => {
    const rows = twoPoolFinalRanking(pools(), results());
    expect(rows?.map(r => r.id)).toEqual(["a1", "b1", "b2", "a2", "a3", "b3", "b4", "a4", "b5", "a5", "b6", "a6", "b7", "a7"]);
    expect(rows?.map(r => r.place)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });
  it("uses pool points difference when game difference is equal", () => {
    const p = pools(); p[0][1].gameDiff = p[1][1].gameDiff;
    expect(twoPoolFinalRanking(p, results())?.slice(2, 4).map(r => r.id)).toEqual(["a2", "b2"]);
  });
  it("retains joint places for exact statistical ties rather than inventing a result", () => {
    const p = pools(); p[0][1] = { ...p[0][1], gameDiff: 6, pointsDiff: 10 };
    expect(twoPoolFinalRanking(p, results())?.slice(2, 4).map(r => r.place)).toEqual([3, 3]);
  });
  it("does not show a final ranking while a final is unfinished", () => {
    const r = results(); r[4].status = "in_progress";
    expect(twoPoolFinalRanking(pools(), r)).toBeNull();
  });
  it("rejects stale final participants that do not match semifinal winners", () => {
    const r = results(); r[4].b = "b2";
    expect(twoPoolFinalRanking(pools(), r)).toBeNull();
  });
  it("does not mutate the pools or their original ranks", () => {
    const p = pools(), before = JSON.stringify(p);
    twoPoolFinalRanking(p, results());
    expect(JSON.stringify(p)).toBe(before);
  });
});