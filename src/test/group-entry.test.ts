import { describe, it, expect } from "vitest";
import {
  groupEntryTotalCents,
  buildGroupEntryPayload,
  eligibleGroupCandidates,
} from "@/lib/tournaments/group-entry";

describe("group tournament entries", () => {
  it("totals one entry fee per player", () => {
    expect(groupEntryTotalCents([{ memberId: "a", name: "A" }, { memberId: "b", name: "B" }], 15000)).toBe(30000);
    expect(groupEntryTotalCents([], 15000)).toBe(0);
  });

  it("keeps partners optional in the payload", () => {
    expect(buildGroupEntryPayload([
      { memberId: "a", name: "A" },
      { memberId: "b", name: "B", partnerMemberId: "c" },
    ])).toEqual([
      { member_id: "a", partner_member_id: null },
      { member_id: "b", partner_member_id: "c" },
    ]);
  });

  it("excludes the payer, already entered and already selected players", () => {
    const members = [
      { id: "payer", gender: "male" },
      { id: "in", gender: "male" },
      { id: "sel", gender: "male" },
      { id: "ok", gender: "male" },
      { id: "she", gender: "female" },
    ];
    const res = eligibleGroupCandidates(members, {
      payerMemberId: "payer",
      alreadyEnteredIds: ["in"],
      selectedIds: ["sel"],
      gender: "men",
    });
    expect(res.map((m) => m.id)).toEqual(["ok"]);
  });

  it("allows both genders on mixed events", () => {
    const members = [{ id: "a", gender: "male" }, { id: "b", gender: "female" }];
    const res = eligibleGroupCandidates(members, {
      payerMemberId: "x", alreadyEnteredIds: [], selectedIds: [], gender: "mixed",
    });
    expect(res).toHaveLength(2);
  });
});
