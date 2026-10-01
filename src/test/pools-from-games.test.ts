import { describe, it, expect } from "vitest";
import { assignPools, poolsFromGames } from "@/lib/swiss-pairing";

const names = ["bryce", "eben", "charlie", "isabella", "amelia", "linda", "lucas", "jaco"];
const entries = names.map((n, i) => ({ id: `e-${n}`, club_member_id: n, group_number: 2, order_index: i }));
let k = 0;
const game = (a: string, b: string, extra: Record<string, unknown> = {}) => ({
  id: `m${k++}`, group_number: 2, round_number: 1, player_a_member_id: a, player_b_member_id: b,
  status: "completed", stage: "group", ...extra,
});
const rr = (pool: string[]) => pool.flatMap((a, i) => pool.slice(i + 1).map((b) => game(a, b)));

describe("poolsFromGames", () => {
  it("follows the pool games played even when entry order splits pools differently", () => {
    const matches = [...rr(["isabella", "charlie", "amelia", "eben"]), ...rr(["bryce", "jaco", "linda", "lucas"])];
    const derived = assignPools(entries, 2, 2, false);
    const pools = poolsFromGames(derived, entries, matches as any, 2, false);
    expect(new Set(["bryce", "jaco", "linda", "lucas"].map((m) => pools.get(m))).size).toBe(1);
    expect(new Set(["isabella", "charlie", "amelia", "eben"].map((m) => pools.get(m))).size).toBe(1);
    expect(pools.get("bryce")).not.toBe(pools.get("amelia"));
  });

  it("ignores play-off games and keeps the derived split before any games exist", () => {
    const derived = assignPools(entries, 2, 2, false);
    expect(poolsFromGames(derived, entries, [], 2, false)).toEqual(derived);
    const ko = [game("bryce", "amelia", { stage: "knockout" })];
    expect(poolsFromGames(derived, entries, ko as any, 2, false)).toEqual(derived);
  });

  it("respects a saved pool number on the games", () => {
    const matches = rr(["bryce", "jaco", "linda", "lucas"]).map((m) => ({ ...m, pool_number: 2 }));
    const pools = poolsFromGames(assignPools(entries, 2, 2, false), entries, matches as any, 2, false);
    expect(pools.get("bryce")).toBe(2);
  });
});
