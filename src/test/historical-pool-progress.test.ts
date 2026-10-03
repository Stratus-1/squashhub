import { describe, expect, it } from "vitest";
import { historicalPoolStatuses, playoffDisplayStages, playoffResult, structuredProgressHeadline } from "@/lib/tournaments/historical-pool-progress";

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
    const pools = [{ stage_key: "pools", status: "completed", winner_member_id: "a1" }];
    expect(structuredProgressHeadline(division, [...pools, ...qfs])).toBe("Quarterfinals complete — Ready for Semifinals.");
  });

  it("shows saved QF scores and winner sides, and feeds only those winners into SF and Final", () => {
    const played = qfs.map((row, i) => ({ ...row,
      game_scores: JSON.stringify({ sets: i === 1 ? [{ a: 8, b: 11 }, { a: 9, b: 11 }, { a: 7, b: 11 }] : [{ a: 11, b: 7 }, { a: 11, b: 9 }, { a: 11, b: 5 }] }),
      winner_member_id: i === 1 ? `b${i + 1}` : `a${i + 1}`,
    }));
    const snapshot = JSON.stringify(played);
    const sf = [
      { id: "sf1", stage_key: "sf", bracket_position: 1, status: "completed", player_a_member_id: "a1", player_b_member_id: "b2", winner_member_id: "b2", game_scores: '{"sets":[{"a":8,"b":11}]}' },
      { id: "sf2", stage_key: "sf", bracket_position: 2, status: "completed", player_a_member_id: "a3", player_b_member_id: "a4", winner_member_id: "a4", game_scores: '{"sets":[{"a":11,"b":13}]}' },
    ];
    const stages = playoffDisplayStages(division, [...played, ...sf]);
    expect(stages[0].matches.map((m) => playoffResult(m).winnerSide)).toEqual(["a", "b", "a", "a"]);
    expect(playoffResult(stages[0].matches[1]).score).toBe("8–11 · 9–11 · 7–11");
    expect(stages[1].matches.map((m) => [m.player_a_member_id, m.player_b_member_id])).toEqual([["a1", "b2"], ["a3", "a4"]]);
    expect(stages[1].matches.map((m) => playoffResult(m).winnerSide)).toEqual(["b", "b"]);
    expect(stages[2].matches.map((m) => [m.player_a_member_id, m.player_b_member_id])).toEqual([["b2", "a4"]]);
    expect(JSON.stringify(played)).toBe(snapshot);
  });

  it("keeps pending stages pending, including partial and malformed results", () => {
    expect(playoffResult({ status: "scheduled", winner_member_id: "a", player_a_member_id: "a" }).winnerSide).toBeNull();
    expect(playoffResult({ status: "completed", winner_member_id: "a", player_a_member_id: "a", game_scores: "not json" }).score).toBeNull();
    const pending = qfs.map((m, i) => i === 2 ? { ...m, status: "scheduled", winner_member_id: null } : m);
    const projected = playoffDisplayStages(division, pending).find((s) => s.id === "sf");
    expect(projected?.matches[1].player_a_member_id).toBeNull();
    expect(projected?.matches[1].feederA).toBe("Winner QF3");
  });
});
