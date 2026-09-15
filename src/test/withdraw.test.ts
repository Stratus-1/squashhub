import { describe, it, expect } from "vitest";
import {
  matchesToClose,
  sideOf,
  withdrawalUpdates,
  removeFromSeedOrder,
  removeFromManualDraws,
} from "@/lib/tournaments/withdraw";


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

describe("pull-out cleans up the setup", () => {
  it("releases the court held for a game that will never be played", () => {
    const [u] = withdrawalUpdates([m({ booking_id: "bk1", court_id: 9 } as any)], "b");
    expect(u.bookingId).toBe("bk1");
    expect(u.payload.court_id).toBeNull();
    expect(u.payload.scheduled_date).toBeNull();
    expect(u.payload.booking_id).toBeNull();
  });

  it("drops the player from the seeding order", () => {
    expect(removeFromSeedOrder(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
    expect(removeFromSeedOrder(["a", "c"], ["b"])).toBeNull();
    expect(removeFromSeedOrder(null, ["b"])).toBeNull();
  });

  it("clears the player out of a saved draw board and drops empty matchups", () => {
    const draws = {
      "1": { groupNumber: 1, round: 1, matches: [{ a: "b", b: null }, { a: "x", b: "b" }, { a: "y", b: "z" }] },
    };
    const next = removeFromManualDraws(draws, ["b"]) as any;
    expect(next["1"].matches).toEqual([
      { a: "x", b: null },
      { a: "y", b: "z" },
    ]);
    expect(removeFromManualDraws(draws, ["nobody"])).toBeNull();
  });
});
