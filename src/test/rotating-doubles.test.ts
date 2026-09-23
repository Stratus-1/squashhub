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

describe("maximum matches per player", () => {
  it("never schedules a player beyond the cap", () => {
    const ids = players(10);
    const { games } = generateRotatingDoublesSchedule(ids, { maxMatchesPerPlayer: 7 });
    const counts = new Map<string, number>(ids.map((p) => [p, 0]));
    for (const g of games) {
      for (const p of [...g.sideA, ...g.sideB]) counts.set(p, (counts.get(p) || 0) + 1);
    }
    for (const p of ids) expect(counts.get(p)!).toBeLessThanOrEqual(7);
    // Balanced: nobody is left far behind the others.
    const vals = [...counts.values()];
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1);
  });

  it("keeps the full rotation when no cap is given", () => {
    const capped = generateRotatingDoublesSchedule(players(8), { maxMatchesPerPlayer: 3 });
    const full = generateRotatingDoublesSchedule(players(8));
    expect(capped.games.length).toBeLessThan(full.games.length);
    expect(full.games).toHaveLength(rotatingDoublesGameCount(8));
  });

  it("still puts four distinct players in every capped game", () => {
    const { games } = generateRotatingDoublesSchedule(players(9), { maxMatchesPerPlayer: 4 });
    for (const g of games) expect(new Set([...g.sideA, ...g.sideB]).size).toBe(4);
  });

  it("does not lock the same partners together when a cap applies", () => {
    const { games } = generateRotatingDoublesSchedule(players(12), { maxMatchesPerPlayer: 9 });
    const counts = new Map<string, number>();
    for (const g of games) {
      for (const side of [g.sideA, g.sideB]) {
        const k = [...side].sort().join("|");
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });
});

describe("excluded partners and strength bias", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `p${i + 1}`); // seeded strongest first

  it("never partners an excluded couple", () => {
    const { games } = generateRotatingDoublesSchedule(ids, {
      maxMatchesPerPlayer: 8,
      avoidPartners: [["p3", "p9"]],
    });
    expect(games.length).toBeGreaterThan(0);
    for (const g of games) {
      for (const side of [g.sideA, g.sideB]) {
        expect(side.includes("p3") && side.includes("p9")).toBe(false);
      }
    }
  });

  it("drops the weakest combinations when the cap leaves games unplayed", () => {
    const { games } = generateRotatingDoublesSchedule(ids, { maxMatchesPerPlayer: 8 });
    const strong = new Set(["p1", "p2", "p3", "p4", "p5", "p6"]);
    let weakWeak = 0;
    let strongWeak = 0;
    for (const g of games) {
      for (const side of [g.sideA, g.sideB]) {
        const s = side.filter((p) => strong.has(p)).length;
        if (s === 0) weakWeak++;
        if (s === 1) strongWeak++;
      }
    }
    expect(strongWeak).toBeGreaterThan(weakWeak);
  });
});

describe("balanced strength mode", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);

  it("pairs similar standards together", () => {
    const gap = (mode: "balanced" | "mixed") => {
      const { games } = generateRotatingDoublesSchedule(ids, {
        maxMatchesPerPlayer: 8,
        strengthMode: mode,
      });
      const idx = (p: string) => ids.indexOf(p);
      let total = 0;
      let n = 0;
      for (const g of games) {
        for (const side of [g.sideA, g.sideB]) {
          total += Math.abs(idx(side[0]) - idx(side[1]));
          n++;
        }
      }
      return total / Math.max(1, n);
    };
    expect(gap("balanced")).toBeLessThan(gap("mixed"));
  });
});
