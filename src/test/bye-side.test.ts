import { describe, it, expect } from "vitest";
import { isByeFixture } from "@/lib/tournaments/bye-side";

/**
 * An odd-sized pool leaves one player without an opponent. The draw stores that
 * as a normal fixture row with only one side filled and does not always set
 * is_bye — the games list must still read "BYE", never "Unknown"/"TBD".
 */
describe("isByeFixture", () => {
  it("is a bye when the row is flagged", () => {
    expect(isByeFixture({ is_bye: true, player_a_member_id: "p1", player_b_member_id: null })).toBe(true);
  });

  it("is a bye when only one side is filled (odd pool, flag never written)", () => {
    expect(isByeFixture({ is_bye: false, player_a_member_id: "p1", player_b_member_id: null })).toBe(true);
    expect(isByeFixture({ player_a_member_id: null, player_b_member_id: "p2" })).toBe(true);
  });

  it("is not a bye when both sides have a player", () => {
    expect(isByeFixture({ player_a_member_id: "p1", player_b_member_id: "p2" })).toBe(false);
  });

  it("is not a bye when neither side is filled (bracket awaiting feeders)", () => {
    expect(isByeFixture({ player_a_member_id: null, player_b_member_id: null })).toBe(false);
  });

  it("is not a bye when the empty side carries a placeholder label", () => {
    expect(isByeFixture({ player_a_member_id: "p1", player_b_member_id: null, placeholder_b: "Winner QF1" })).toBe(false);
    expect(isByeFixture({ player_a_member_id: "p1", player_b_member_id: null, placeholder_b: "Empty slot" })).toBe(false);
  });

  it("tolerates a missing row", () => {
    expect(isByeFixture(null)).toBe(false);
    expect(isByeFixture(undefined)).toBe(false);
  });
});
