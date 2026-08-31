import { describe, it, expect } from "vitest";
import {
  PARTNER_MUST_REGISTER_MESSAGE,
  PARTNER_OPTION_FIELDS,
  doublesDivisions,
  pairAction,
  pairForDivision,
  pairStatusLabel,
  partnerOptionSubtitle,
  sanitizePartnerOption,
  sanitizePartnerOptions,
  type MyPair,
} from "../doubles";
import { inviteState, type InvitePayload } from "../invite-link";

const divisions = [
  { group_number: 1, label: "Men's Doubles", match_type: "doubles" },
  { group_number: 2, label: "Men's Singles", match_type: "singles" },
  { group_number: 3, label: "Mixed Doubles", match_type: "doubles" },
];

const pair = (over: Partial<MyPair> = {}): MyPair => ({
  id: "p1",
  group_number: 1,
  status: "pending",
  proposed_by_me: true,
  partner_member_id: "m2",
  partner_name: "Ann Botha",
  partner_club: "Riverside",
  ...over,
});

describe("privacy-safe partner options", () => {
  it("keeps only name, club, gender and ladder position", () => {
    const safe = sanitizePartnerOption({
      member_id: "m2",
      display_name: "Ann Botha",
      club_id: "c1",
      club_name: "Riverside",
      gender: "female",
      ladder_position: 4,
      email: "ann@example.com",
      phone: "0821234567",
      id_number: "9001015800083",
      date_of_birth: "1990-01-01",
    } as any);
    expect(Object.keys(safe as any).sort()).toEqual([...PARTNER_OPTION_FIELDS].sort());
    expect(JSON.stringify(safe)).not.toMatch(/example\.com|0821234567|9001015800083|1990-01-01/);
  });

  it("drops rows without an id or name", () => {
    expect(sanitizePartnerOptions([{ member_id: "", display_name: "X" }, null, 3])).toEqual([]);
  });

  it("renders a club and ranking subtitle only", () => {
    expect(partnerOptionSubtitle(sanitizePartnerOption({ member_id: "m", display_name: "N", club_name: "Riverside", ladder_position: 7 })!))
      .toBe("Riverside · Ladder #7");
  });
});

describe("which divisions need a partner", () => {
  it("returns only entered doubles divisions", () => {
    expect(doublesDivisions(divisions, [1, 2]).map((d) => d.group_number)).toEqual([1]);
  });

  it("singles-only entries are unaffected", () => {
    expect(doublesDivisions(divisions, [2])).toEqual([]);
  });

  it("supports multiple doubles divisions", () => {
    expect(doublesDivisions(divisions, [1, 3]).map((d) => d.group_number)).toEqual([1, 3]);
  });
});

describe("pairing state machine", () => {
  it("first player registers with nobody available", () => {
    expect(pairForDivision([], 1)).toBeNull();
    expect(pairAction(null, false)).toBe("choose");
    expect(pairStatusLabel(null)).toBe("No partner yet");
  });

  it("shows the correct empty-list message", () => {
    expect(PARTNER_MUST_REGISTER_MESSAGE).toBe(
      "Only players who were invited to this division can be picked as a partner.",
    );
  });

  it("proposer waits for the partner to accept", () => {
    const p = pair();
    expect(pairAction(p, false)).toBe("awaiting_partner");
    expect(pairStatusLabel(p)).toMatch(/Waiting for Ann Botha/);
  });

  it("recipient is asked to accept or reject", () => {
    const p = pair({ proposed_by_me: false });
    expect(pairAction(p, false)).toBe("respond");
    expect(pairStatusLabel(p)).toMatch(/asked to pair with you/);
  });

  it("confirmed pair can still be changed before the lock", () => {
    const p = pair({ status: "confirmed" });
    expect(pairAction(p, false)).toBe("confirmed");
    expect(pairStatusLabel(p)).toBe("Paired with Ann Botha — pair locked");
  });

  it("organiser lock blocks every change", () => {
    expect(pairAction(pair({ status: "confirmed" }), true)).toBe("locked");
    expect(pairAction(pair({ proposed_by_me: false }), true)).toBe("locked");
    expect(pairAction(null, true)).toBe("locked");
  });

  it("a confirmed pair wins over a stale pending one, and history is ignored", () => {
    const pairs = [
      pair({ id: "old", status: "pending" }),
      pair({ id: "live", status: "confirmed", partner_member_id: "m9" }),
      pair({ id: "gone", status: "rejected" } as any),
    ];
    expect(pairForDivision(pairs, 1)?.id).toBe("live");
  });

  it("ignores pairs from another division", () => {
    expect(pairForDivision([pair({ group_number: 3 })], 1)).toBeNull();
  });
});

describe("invitation states stay intact", () => {
  const base: InvitePayload = { found: true, can_respond_public: true, champ_id: "t1" };

  it("secure token can be answered without a login", () => {
    expect(inviteState(base)).toBe("actionable");
  });

  it("accepted but unpaid stays distinct from paid", () => {
    expect(inviteState({ ...base, confirmed_at: "2026-01-01", status: "pending_payment" })).toBe(
      "payment_pending",
    );
    expect(inviteState({ ...base, confirmed_at: "2026-01-01", status: "paid" })).toBe("registered");
  });

  it("declined invitees are not active entrants", () => {
    expect(inviteState({ ...base, status: "cancelled", declined_at: "2026-01-02" })).toBe("declined");
  });

  it("revoked and unknown tokens are dead ends", () => {
    expect(inviteState({ ...base, revoked: true })).toBe("revoked");
    expect(inviteState({ found: false })).toBe("not_found");
  });
});
