import { describe, expect, it } from "vitest";
import { buildPoolWeeks, divisionPlayDates, diamondPlayoffsOn, type DiamondTeam } from "@/lib/tournaments/team-league";

const teams = (n: number): DiamondTeam[] => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `T${i}`, pool: i < n / 2 ? "A" : "B", players: [] }));

describe("Diamond division schedules", () => {
  it("legacy: no schedules keeps shared week dates and no tie dates", () => {
    const w = buildPoolWeeks(teams(8), ["2026-10-07", "2026-10-14", "2026-10-21"], 4);
    expect(w.map((x) => x.date)).toEqual(["2026-10-07", "2026-10-14", "2026-10-21"]);
    expect(w[0].ties.every((t) => t.date === undefined)).toBe(true);
    expect(w[0].ties.map((t) => t.court)).toEqual([1, 2, 3, 4]);
  });
  it("each division plays its own round robin on its own days", () => {
    const w = buildPoolWeeks(teams(12), [], 3, { startDate: "2026-10-05", schedules: { A: { playDays: [3] }, B: { playDays: [4], startTime: "18:30" } } });
    expect(w).toHaveLength(5);
    const a = w.flatMap((x) => x.ties).filter((t) => t.label!.startsWith("A"));
    const b = w.flatMap((x) => x.ties).filter((t) => t.label!.startsWith("B"));
    expect(a).toHaveLength(15); expect(b).toHaveLength(15);
    expect(new Set(a.map((t) => new Date(t.date!).getUTCDay()))).toEqual(new Set([3]));
    expect(new Set(b.map((t) => new Date(t.date!).getUTCDay()))).toEqual(new Set([4]));
    expect(b.every((t) => t.time === "18:30")).toBe(true);
    expect(w[0].ties.filter((t) => t.label!.startsWith("B")).map((t) => t.court)).toEqual([1, 2, 3]);
  });
  it("dates and play-offs default", () => {
    expect(divisionPlayDates("2026-10-05", [3], 2)).toEqual(["2026-10-07", "2026-10-14"]);
    expect(diamondPlayoffsOn({})).toBe(true);
    expect(diamondPlayoffsOn({ playoffs: false })).toBe(false);
  });
});
