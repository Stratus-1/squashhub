import { describe, expect, it } from "vitest";
import { TEN_REMAINDER_CHART, tenRemainderSlots, usesTenRemainderChart } from "@/lib/tournaments/swiss-rr-finish";

const key = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

describe("10-player remainder position chart (Ladies B, approved)", () => {
  it("never repeats a position pair and pairs neighbours only in round 5", () => {
    const seen = new Set<string>();
    for (const r of [3, 4, 5]) for (const [a, b] of TEN_REMAINDER_CHART[r]) {
      expect(seen.has(key(a, b))).toBe(false);
      seen.add(key(a, b));
      if (r < 5) expect(Math.abs(a - b)).toBeGreaterThan(1);
    }
    expect(TEN_REMAINDER_CHART[5]).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]);
  });

  it("winner takes the better slot, loser the worse", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);
    // R3: slot 6 (p6) beats slot 1 (p1); others the better slot wins.
    const games = TEN_REMAINDER_CHART[3].map(([a, b]) => ({ a: ids[a - 1], b: ids[b - 1], winner: a === 1 ? ids[5] : ids[a - 1], round: 3 }));
    const slots = tenRemainderSlots(ids, 4, games);
    expect(slots[0]).toBe("p6");
    expect(slots[5]).toBe("p1");
    expect(slots[1]).toBe("p2");
  });

  it("keeps a slot empty until its game is decided", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);
    expect(tenRemainderSlots(ids, 4, []).every((s) => s === null)).toBe(true);
  });

  it("is only used when switched on and the remainder has ten players", () => {
    expect(usesTenRemainderChart({ enabled: true, groups: 2, remainderChart: "ten_position_swap" }, 10)).toBe(true);
    expect(usesTenRemainderChart({ enabled: true, groups: 2 }, 10)).toBe(false);
    expect(usesTenRemainderChart({ enabled: true, groups: 3, remainderChart: "ten_position_swap" }, 6)).toBe(false);
  });
});
