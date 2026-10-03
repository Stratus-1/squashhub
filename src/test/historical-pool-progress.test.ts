import { describe, expect, it } from "vitest";
import { historicalPoolStatuses, playoffDisplayStages, structuredProgressHeadline } from "@/lib/tournaments/historical-pool-progress";

const division = { stages: [
  { id: "pools", name: "Pools", order: 0 },
  { id: "qf", name: "Quarterfinals", order: 1 },
  { id: "sf", name: "Semifinals", order: 2, mapping: { source: "stage_winners", sourceStageId: "qf", units: [1,2,3,4].map((position) => ({ id: `A${position}`, slots: [{ pool: 0, position }] })), matches: [{ order: 1, a: "A1", b: "A2" }, { order: 2, a: "A3", b: "A4" }] } },
  { id: "f", name: "Final", order: 3, mapping: { source: "stage_winners", sourceStageId: "sf", units: [1,2].map((position) => ({ id: `A${position}`, slots: [{ pool: 0, position }] })), matches: [{ order: 1, a: "A1", b: "A2" }] } },
] };
const qfs = [1,2,3,4].map((n) => ({ id: `q${n}`, stage_key: "qf", bracket_position: n, status: "completed", player_a_member_id: `a${n}`, player_b_member_id: `b${n}`, winner_member_id: `a${n}` }));
const pool = [...Array.from({ length: 4 }, (_, i) => ({ memberId: `a${i+1}` })), ...Array.from({ length: 4 }, (_, i) => ({ memberId: `b${i+1}` })), { memberId: "a5" }];

describe("historical pool progression presentation", () => {
  it("keeps pool rows in place while deriving non-qualifiers and QF losers", () => {
    const rowsBefore = JSON.stringify(pool);
    const status = historicalPoolStatuses(division, qfs, pool);
    expect(JSON.stringify(pool)).toBe(rowsBefore);
    expect(status.get("a5")).toEqual({ eliminated: true, label: "Eliminated" });
    expect(status.get("b1")).toEqual({ eliminated: true, label: "Eliminated" });
    expect(status.get("a1")).toEqual({ eliminated: false, label: "Advanced to Semifinals" });
    expect([...status.values()].filter((s) => !s.eliminated).length).toBe(4);
  });

  it("projects the configured Semifinal pairings from QF winners", () => {
    const stages = playoffDisplayStages(division, qfs);
    expect(stages.map((s) => s.name)).toEqual(["Quarterfinals", "Semifinals"]);
    expect(stages[1].projected).toBe(true);
    expect(stages[1].matches.map((m) => [m.player_a_member_id, m.player_b_member_id])).toEqual([["a1", "a2"], ["a3", "a4"]]);
  });

  it("uses configured playoff names instead of generic round numbers", () => {
    expect(structuredProgressHeadline(division, qfs)).toBe("Quarterfinals complete — Ready for Semifinals.");
  });
});
