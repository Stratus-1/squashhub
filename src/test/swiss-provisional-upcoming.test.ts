import { describe, it, expect } from "vitest";
import { isProvisionalSwissSlot, splitFixtures } from "@/lib/tournaments/fixture-split";
const sw = { scoring_mode: "swiss" };
describe("Swiss progressive lock in Upcoming", () => {
  it("hides slots until both players are known, even with date/court", () => {
    const tbd = { status: "scheduled", player_a_member_id: "p1", player_b_member_id: null, scheduled_date: "2026-11-11", court_id: 1 };
    const real = { status: "scheduled", player_a_member_id: "p1", player_b_member_id: "p2" };
    expect(isProvisionalSwissSlot(tbd, sw)).toBe(true);
    expect(isProvisionalSwissSlot(real, sw)).toBe(false);
    expect(isProvisionalSwissSlot({ ...tbd, is_bye: true }, sw)).toBe(false);
    expect(splitFixtures([tbd, real].filter((m) => !isProvisionalSwissSlot(m, sw))).upcoming).toEqual([real]);
  });
  it("leaves non-Swiss placeholders alone", () => {
    expect(isProvisionalSwissSlot({ player_a_member_id: null, stage: "final" }, { scoring_mode: "standard" })).toBe(false);
    expect(isProvisionalSwissSlot({ player_a_member_id: null, stage_key: "swiss-r2" })).toBe(true);
  });
});
