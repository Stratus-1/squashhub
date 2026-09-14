import { describe, expect, it } from "vitest";
import {
  generateRotatingDoublesSchedule,
  isRotationEntity,
  parseRotationEntity,
  rotationEntityId,
  rotatingDoublesGameCount,
} from "@/lib/tournaments/rotating-doubles";

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("rotating doubles entity ids", () => {
  it("round-trips a pair id", () => {
    const id = rotationEntityId("a", "b");
    expect(isRotationEntity(id)).toBe(true);
    const parsed = parseRotationEntity(id);
    expect(parsed).toEqual({ player1Id: "a", player2Id: "b" });
  });

  it("ignores non-rotation ids", () => {
    expect(parseRotationEntity("member-123")).toBeNull();
    expect(isRotationEntity("member-123")).toBe(false);
  });
});

describe("generateRotatingDoublesSchedule", () => {
  it("returns nothing for fewer than four players", () => {
    expect(generateRotatingDoublesSchedule(players(3)).games).toHaveLength(0);
  });

  it("pairs every player with every other for 8 players", () => {
    const ids = players(8);
    const { games, rounds } = generateRotatingDoublesSchedule(ids);
    expect(rounds).toBe(7);
    expect(games).toHaveLength(rotatingDoublesGameCount(8));

    const partnered = new Set<string>();
    for (const g of games) {
      partnered.add([...g.sideA].sort().join("|"));
      partnered.add([...g.sideB].sort().join("|"));
    }
    // 8 players → 28 distinct partnerships, each occurring exactly once.
    expect(partnered.size).toBe(28);
  });

  it("never puts a player on both sides or twice in a round", () => {
    for (const n of [4, 8]) {
      const { games } = generateRotatingDoublesSchedule(players(n));
      const perRound = new Map<number, Set<string>>();
      for (const g of games) {
        const four = [...g.sideA, ...g.sideB];
        expect(new Set(four).size).toBe(4);
        const seen = perRound.get(g.round) ?? new Set<string>();
        for (const p of four) {
          expect(seen.has(p)).toBe(false);
          seen.add(p);
        }
        perRound.set(g.round, seen);
      }
    }
  });

  it("honours a maxRounds cap for short sessions", () => {
    const { rounds, games } = generateRotatingDoublesSchedule(players(8), { maxRounds: 3 });
    expect(rounds).toBe(3);
    expect(games.every((g) => g.round <= 3)).toBe(true);
  });
});
