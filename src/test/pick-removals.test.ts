import { describe, it, expect } from "vitest";
import { removePick, unmarkRemoved, shouldAutoAdd, picksSignature, removalImpact, shouldFillEntryPlaces } from "@/lib/smart-builder/pick-removals";

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

describe("shouldFillEntryPlaces", () => {
  it("places a Not-placed entrant into the category their pair gave them", () => {
    expect(shouldFillEntryPlaces([], [], "pieter", ["mens-doubles"])).toBe(true);
  });
  it("keeps the organiser's placement once a player is in any category", () => {
    expect(shouldFillEntryPlaces(["mixed"], [], "willem", ["mens-doubles", "mixed"])).toBe(false);
  });
  it("never restores a player the organiser removed", () => {
    expect(shouldFillEntryPlaces([], ["pieter"], "pieter", ["mens-doubles"])).toBe(false);
  });
});

import { boardEntries, pruneCancelledPicks, type BoardReg } from "@/lib/smart-builder/pick-removals";
import { isEnteredRegistration } from "@/lib/smart-builder/step-handover";

describe("player board: cancelled players and invitations (No Frills Doubles)", () => {
  const row = (o: Partial<BoardReg> & { club_member_id: string }): BoardReg => ({ partner_member_id: null, status: "pending_payment", division_choices: [], ...o });
  const rows: BoardReg[] = [
    row({ club_member_id: "gerhard", status: "cancelled", registration_status: "declined", registration_source: "organiser", confirmed_at: "2026-11-16T08:02:39Z", division_choices: [1, 3] }),
    row({ club_member_id: "bernard", registration_source: "organiser", confirmed_at: "2026-11-16T09:55:48Z", division_choices: [1] }),
    row({ club_member_id: "bernice", status: "paid", registration_status: "registered", registration_source: "organiser", confirmed_at: "2026-11-16T10:13:34Z", division_choices: [3], division_partners: { "3": "neill" } }),
    row({ club_member_id: "neill", division_choices: [3], division_partners: { "3": "bernice" } }),
    row({ club_member_id: "abdul" }),
    row({ club_member_id: "kept", status: "cancelled", withdrawn_keep_position: true, division_choices: [1] }),
  ];
  const b = boardEntries(rows, isEnteredRegistration);

  it("a player who cancelled is taken off the board", () => {
    expect(b.cancelled).toContain("gerhard");
    const picks = pruneCancelledPicks({ gerhard: ["Mens", "Mixed"], bernard: ["Mens"] }, b.cancelled);
    expect(picks).toEqual({ bernard: ["Mens"] });
  });

  it("an invitation alone is not an entry", () => {
    expect(b.entered.has("abdul")).toBe(false);
    expect(b.entered.get("bernard")).toEqual([1]);
  });

  it("a partner paid for by a real entry counts as entered in that event", () => {
    expect(b.entered.get("neill")).toEqual([3]);
  });

  it("a mid-tournament withdrawal that keeps its place stays on the board", () => {
    expect(b.cancelled).not.toContain("kept");
  });
});
