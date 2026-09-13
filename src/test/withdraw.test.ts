import { describe, it, expect } from "vitest";
import { matchesToClose, sideOf, withdrawalUpdates } from "@/lib/tournaments/withdraw";

const m = (over: Partial<any> = {}) => ({
  id: "m1",
  status: "scheduled",
  player_a_member_id: "a",
  player_b_member_id: "b",
  ...over,
});

describe("player pulls out", () => {
  it("finds the player's side, including doubles partners", () => {
    expect(sideOf(m(), "b")).toBe("b");
    expect(sideOf(m({ partner_b_member_id: "b2" }), "b2")).toBe("b");
    expect(sideOf(m(), "z")).toBeNull();
  });

  it("only closes unplayed games", () => {
    const rows = [m(), m({ id: "m2", status: "completed" }), m({ id: "m3", is_bye: true })];
    expect(matchesToClose(rows, "b").map((r) => r.id)).toEqual(["m1"]);
  });

  it("gives the opponent a walkover win", () => {
    const [u] = withdrawalUpdates([m()], "b");
    expect(u.id).toBe("m1");
    expect(u.payload.winner_member_id).toBe("a");
    expect(u.payload.status).toBe("completed");
    expect(u.payload.forfeit_member_id).toBe("b");
  });

  it("skips fixtures with no opponent yet", () => {
    expect(withdrawalUpdates([m({ player_a_member_id: null })], "b")).toEqual([]);
  });
});
