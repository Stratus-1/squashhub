import { describe, expect, it } from "vitest";
import { MYBURG_FEEDERS, MYBURG_TOURNAMENT, myburgFinalPlacements, type HandoverRow } from "../../supabase/functions/_shared/myburg-final-handover";
const row = (id: string): HandoverRow => ({ id, champ_id: MYBURG_TOURNAMENT, division_id: "division", status: "scheduled", player_a_member_id: null, player_b_member_id: null, winner_member_id: null, score: null, game_scores: null, side_a_points: 0, side_b_points: 0, placeholder_a: null, placeholder_b: null });
function fixture() {
  const finals = [row(MYBURG_FEEDERS[0][1]), row(MYBURG_FEEDERS[2][1])];
  const sources = MYBURG_FEEDERS.map(([id, finalId, side, label], i) => {
    const final = finals.find(f => f.id === finalId);
    if (final) final[`placeholder_${side}`] = label;
    return { ...row(id), status: "completed", player_a_member_id: `winner${i + 1}`, player_b_member_id: `loser${i + 1}`, winner_member_id: `winner${i + 1}` };
  });
  return [...sources, ...finals];
}
describe("Myburg saved semifinal to final handover", () => {
  it("sends SF1/SF2 to the Final and SF3/SF4 to the fifth-place final", () => {
    expect(myburgFinalPlacements(fixture()).map(p => [p.finalId, p.side, p.winner])).toEqual([
      [MYBURG_FEEDERS[0][1], "a", "winner1"], [MYBURG_FEEDERS[0][1], "b", "winner2"],
      [MYBURG_FEEDERS[2][1], "a", "winner3"], [MYBURG_FEEDERS[2][1], "b", "winner4"],
    ]);
  });
  it("does not guess an unfinished semifinal winner", () => { const rows = fixture(); rows[0].status = "in_progress"; expect(myburgFinalPlacements(rows)).toHaveLength(3); });
  it("rejects a winner who did not play the semifinal", () => { const rows = fixture(); rows[0].winner_member_id = "outsider"; expect(myburgFinalPlacements(rows)).toHaveLength(3); });
  it("never overwrites a filled final slot on retry", () => { const rows = fixture(); rows[4].player_a_member_id = "winner1"; expect(myburgFinalPlacements(rows)).toHaveLength(3); });
  it("does not change a final that has started", () => { const rows = fixture(); rows[4].game_scores = '{"current":{"a":1,"b":0}}'; expect(myburgFinalPlacements(rows)).toHaveLength(2); });
  it("does not affect another tournament", () => { const rows = fixture().map(r => ({ ...r, champ_id: "other" })); expect(myburgFinalPlacements(rows)).toEqual([]); });
  it("does not cross divisions", () => { const rows = fixture(); rows[0].division_id = "other"; expect(myburgFinalPlacements(rows)).toHaveLength(3); });
});