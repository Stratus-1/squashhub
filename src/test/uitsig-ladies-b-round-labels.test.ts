import { describe, it, expect } from "vitest";
import { uitsigLadiesBRoundLabels } from "@/lib/tournaments/uitsig-ladies-b-round-labels";
const champ = "f954222a-0f0a-4d8c-ac7b-9c74042cc69e";
const fixtures = [[1,2,1],[4,2,2],[1,3,2],[2,3,3],[1,4,4],[3,4,5]].map(([a,b,r]) => ({
  id: `${a}-${b}`, champ_id: champ, group_number: 6, pool_number: 2, stage: "group", round_number: r,
  player_a_member_id: `p${a}`, player_b_member_id: `p${b}`, booking_id: `booking-${a}-${b}`, scheduled_date: "2026-11-10", score: "15-8",
}));
describe("Ladies B fixture-list rounds", () => {
  it("uses the same three complementary pool rounds and leaves saved fields intact", () => {
    const before = JSON.stringify(fixtures);
    const labels = uitsigLadiesBRoundLabels(fixtures, champ, 6, 3);
    expect([...new Set(labels.values())].sort()).toEqual([1,2,3]);
    expect(labels.get("1-4")).toBe(2);
    expect(labels.get("3-4")).toBe(1);
    expect(labels.get("2-3")).toBe(2);
    expect(JSON.stringify(fixtures)).toBe(before);
  });
  it("does not affect other categories, tournaments or round counts", () => {
    expect(uitsigLadiesBRoundLabels(fixtures, champ, 5, 3).size).toBe(0);
    expect(uitsigLadiesBRoundLabels(fixtures, "other", 6, 3).size).toBe(0);
    expect(uitsigLadiesBRoundLabels(fixtures, champ, 6, 5).size).toBe(0);
  });
});