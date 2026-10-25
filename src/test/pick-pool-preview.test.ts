import { describe, expect, it } from "vitest";
import { pickPoolPreview } from "@/lib/smart-builder/pick-pool-preview";

const pairs: Array<[string, string]> = Array.from({ length: 24 }, (_, i) => [`a${i + 1}`, `b${i + 1}`]);
const input = { ids: pairs.flat(), pairs, registrations: [], group: 1, groups: 1, doubles: true, pools: 6, seeding: "ranking", scope: "club", points: new Map(pairs.flatMap(([a, b], i) => [[a, 24 - i], [b, 24 - i]] as Array<[string, number]>)), ladder: new Map(pairs.flatMap(([a, b], i) => [[a, i], [b, i]] as Array<[string, number]>)), mode: "snake" as const };

describe("picked doubles pool preview", () => {
  it("places 24 ranked pairs into six four-pair pools by snake, never individual ladder", () => {
    const result = pickPoolPreview(input);
    expect(result.issue).toBeNull();
    expect(result.pools.map((p) => p.map((u) => Number(u.member.slice(1))))).toEqual([
      [1, 12, 13, 24], [2, 11, 14, 23], [3, 10, 15, 22],
      [4, 9, 16, 21], [5, 8, 17, 20], [6, 7, 18, 19],
    ]);
  });
  it("keeps all 48 players in their original pairs exactly once", () => {
    const units = pickPoolPreview(input).pools.flat();
    expect(units.map((u) => [u.member, u.partner]).sort()).toEqual([...pairs].sort());
    expect(new Set(units.flatMap((u) => [u.member, u.partner])).size).toBe(48);
  });
  it("shows six empty pools rather than inventing partners", () => {
    const result = pickPoolPreview({ ...input, pairs: [] });
    expect(result.issue).toMatch(/no doubles partner/);
    expect(result.pools.map((p) => p.length)).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it("does not substitute ladder when club rankings are missing", () => {
    expect(pickPoolPreview({ ...input, points: new Map() }).issue).toMatch(/ranking points/);
  });
});