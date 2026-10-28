import { describe, expect, it } from "vitest";
import { finalLadderMoves } from "@/lib/tournaments/final-ladder";

describe("final tournament ladder", () => {
  const member = (id: string, ladder_position: number | null, gender = "male") => ({ id, ladder_position, gender });
  it("uses final finishing order, preserving non-participants and exact sparse slots", () => {
    expect(finalLadderMoves([member("a", 2), member("other", 5), member("b", 9)], ["b", "a"], false))
      .toEqual([{ id: "b", from: 9, to: 2 }, { id: "a", from: 2, to: 9 }]);
  });
  it("keeps men and ladies independent", () => {
    expect(finalLadderMoves([member("a", 1), member("b", 2), member("f", 1, "female"), member("g", 2, "female")], ["g", "b", "f", "a"], false))
      .toEqual([{ id: "b", from: 2, to: 1 }, { id: "a", from: 1, to: 2 }, { id: "g", from: 2, to: 1 }, { id: "f", from: 1, to: 2 }]);
  });
  it("uses one order for a combined ladder", () => {
    expect(finalLadderMoves([member("a", 1), member("f", 2, "female")], ["f", "a"], true))
      .toEqual([{ id: "f", from: 2, to: 1 }, { id: "a", from: 1, to: 2 }]);
  });
  it("ignores unranked or external entrants and repeated identities", () => {
    expect(finalLadderMoves([member("a", 1), member("b", 2), member("new", null)], ["external", "b", "b", "new", "a"], false))
      .toEqual([{ id: "b", from: 2, to: 1 }, { id: "a", from: 1, to: 2 }]);
  });
  it("reapplying the same final order makes no changes", () => {
    expect(finalLadderMoves([member("b", 1), member("a", 2)], ["b", "a"], false)).toEqual([]);
  });
});