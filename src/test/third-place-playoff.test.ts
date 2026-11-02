import { describe, it, expect } from "vitest";
import { withThirdPlace } from "@/lib/smart-builder/playoff-chain";
const sf: any = { id: "v-po1", order: 1, name: "Semifinal", mapping: { source: "stage_standings", matches: [{}, {}] } };
const fin: any = { id: "v-po2", order: 2, name: "Final", mapping: { source: "stage_winners", sourceStageId: "v-po1", matches: [{}] } };
describe("3rd/4th place play-off", () => {
  it("semifinal losers play before the final", () => {
    const r = withThirdPlace({ stages: [sf, fin], reason: null, notes: [] });
    expect(r.stages.map((s) => s.name)).toEqual(["Semifinal", "3rd place", "Final"]);
    expect(r.stages[1].mapping).toMatchObject({ source: "stage_winners", sourceStageId: "v-po1", losers: true });
    expect(r.stages[2].order).toBeGreaterThan(r.stages[1].order);
  });
  it("is not added without a semifinal", () => {
    expect(withThirdPlace({ stages: [{ ...fin, mapping: { source: "stage_standings", matches: [{}] } }], reason: null, notes: [] }).stages).toHaveLength(1);
  });
});
import { stageWinners } from "@/lib/tournaments/structured-persist";
describe("losers lookup", () => {
  it("returns the loser of each semifinal", () => {
    const rows = [{ stage_key: "sf", round_number: 1, bracket_position: 1, player_a_member_id: "p1", player_b_member_id: "p4", winner_member_id: "p1" },
                  { stage_key: "sf", round_number: 1, bracket_position: 2, player_a_member_id: "p2", player_b_member_id: "p3", winner_member_id: "p3" }];
    expect(stageWinners({ id: "sf", name: "Semifinal" } as any, rows, true)).toEqual(["p4", "p2"]);
  });
});
