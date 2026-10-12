import { describe, it, expect } from "vitest";
import { removePick, unmarkRemoved, shouldAutoAdd, picksSignature, removalImpact } from "@/lib/smart-builder/pick-removals";

describe("pick removals stick", () => {
  it("removed player is not auto-added back from an active entry", () => {
    const r = removePick({ a: ["MS"], b: ["MS"] }, undefined, "a");
    expect("a" in r.picks).toBe(false);
    expect(shouldAutoAdd(r.picks, r.removedPicks, "a")).toBe(false);
    expect(shouldAutoAdd(r.picks, r.removedPicks, "c")).toBe(true);
  });
  it("explicit re-add clears the mark", () => {
    expect(unmarkRemoved(["a", "b"], "a")).toEqual(["b"]);
  });
  it("signature changes on add/remove/move, not on order", () => {
    const s1 = picksSignature({ a: ["MS", "MD"], b: [] }, []);
    expect(picksSignature({ b: [], a: ["MD", "MS"] }, [])).toBe(s1);
    expect(picksSignature({ a: ["MS"], b: [] }, [])).not.toBe(s1);
    expect(picksSignature({ a: ["MS", "MD"] }, ["b"])).not.toBe(s1);
  });
  it("classifies removal impact", () => {
    expect(removalImpact([]).kind).toBe("none");
    expect(removalImpact([{ status: "scheduled", winner_member_id: null, score: null, is_bye: false }]).kind).toBe("unplayed");
    expect(removalImpact([{ status: "completed", winner_member_id: "x", score: "3-0", is_bye: false }]).kind).toBe("played");
    expect(removalImpact([{ status: "scheduled", winner_member_id: null, score: null, is_bye: true }]).kind).toBe("none");
  });
});
