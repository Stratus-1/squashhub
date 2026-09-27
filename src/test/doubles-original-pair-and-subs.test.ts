import { describe, it, expect } from "vitest";
import { countOriginalPairs, pairKey, pairsEffectiveOn, splitPairLabel } from "@/lib/leagues/original-pair-bonus";
import { checkDoublesSub } from "@/lib/leagues/doubles-sub-eligibility";

describe("original-pair bonus", () => {
  const originals = [pairKey("Anna", "Ben"), pairKey("Cara", "Dan")];

  it("awards a pair only when both originals play together", () => {
    expect(countOriginalPairs(["Ben & Anna", "Cara & Dan"], originals)).toBe(2);
  });
  it("gives nothing when one player is a sub", () => {
    expect(countOriginalPairs(["Anna & Sub Guy", "Cara & Dan"], originals)).toBe(1);
  });
  it("counts each original pair once", () => {
    expect(countOriginalPairs(["Anna & Ben", "Anna & Ben"], originals)).toBe(1);
  });
  it("splits labels", () => {
    expect(splitPairLabel("A / B")).toEqual(["a", "b"]);
    expect(splitPairLabel("Solo")).toBeNull();
  });

  const history = [
    { one: "Anna", two: "Ben", effective_from: "2000-01-01", effective_to: "2026-09-10", is_active: false },
    { one: "Anna", two: "Eve", effective_from: "2026-09-10", effective_to: null, is_active: true },
  ];
  it("admin-edited pair is the original pair from its edit date", () => {
    const after = pairsEffectiveOn(history, "2026-09-17").map((p) => pairKey(p.one, p.two));
    expect(countOriginalPairs(["Anna & Eve"], after)).toBe(1);
    expect(countOriginalPairs(["Anna & Ben"], after)).toBe(0);
  });
  it("fixtures before the edit keep the old pair", () => {
    const before = pairsEffectiveOn(history, "2026-09-03").map((p) => pairKey(p.one, p.two));
    expect(countOriginalPairs(["Anna & Ben"], before)).toBe(1);
  });
});

describe("doubles sub eligibility", () => {
  const base = { enforce: true, fromReserves: true, fromByeTeam: true, rankRule: "same" as const };
  it("allows a same-rank reserve", () => {
    expect(checkDoublesSub(base, { reserveRank: 2 }, 2).ok).toBe(true);
  });
  it("blocks wrong rank under 'same'", () => {
    const r = checkDoublesSub(base, { reserveRank: 1 }, 3);
    expect(r.ok).toBe(false);
  });
  it("'same_or_lower' blocks stronger players only", () => {
    const rules = { ...base, rankRule: "same_or_lower" as const };
    expect(checkDoublesSub(rules, { byeRank: 3 }, 2).ok).toBe(true);
    expect(checkDoublesSub(rules, { byeRank: 1 }, 2).ok).toBe(false);
  });
  it("respects source toggles", () => {
    expect(checkDoublesSub({ ...base, fromByeTeam: false }, { byeRank: 2 }, 2).ok).toBe(false);
    expect(checkDoublesSub({ ...base, fromReserves: false }, { reserveRank: 2 }, 2).ok).toBe(false);
  });
  it("not enforced = always ok", () => {
    expect(checkDoublesSub({ ...base, enforce: false }, {}, 1).ok).toBe(true);
  });
});
