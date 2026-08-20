import { describe, it, expect } from "vitest";
import {
  afterAcceptPath,
  buildInviteUrl,
  inviteFeeCents,
  inviteLoginPath,
  inviteState,
  inviteePath,
  type InvitePayload,
} from "@/lib/tournaments/invite-link";

const base: InvitePayload = { found: true, champ_id: "c1", status: "pending_payment", is_invitee: true };

describe("invitation links", () => {
  it("builds one canonical tenant URL for every channel", () => {
    expect(buildInviteUrl("abc", "nsc")).toBe("https://nsc.squashhub.co.za/i/abc");
    expect(inviteePath("abc")).toBe("/i/abc");
  });

  it("never leaks member ids — only the opaque token", () => {
    const url = buildInviteUrl("tok123", "nsc");
    expect(url).not.toMatch(/member|uuid|=/);
    expect(url.endsWith("/i/tok123")).toBe(true);
  });

  it("preserves invite context through login", () => {
    expect(inviteLoginPath("tok")).toBe("/auth?redirectTo=%2Fi%2Ftok");
  });
});

describe("invite state machine", () => {
  it("handles missing and revoked invites", () => {
    expect(inviteState(null)).toBe("not_found");
    expect(inviteState({ found: false })).toBe("not_found");
    expect(inviteState({ ...base, revoked: true })).toBe("revoked");
  });

  it("treats cancelled/declined as declined", () => {
    expect(inviteState({ ...base, status: "cancelled" })).toBe("declined");
    expect(inviteState({ ...base, declined_at: "2026-08-01" })).toBe("declined");
  });

  it("treats paid-equivalent statuses as registered", () => {
    for (const s of ["paid", "waived", "registered", "active"]) {
      expect(inviteState({ ...base, status: s })).toBe("registered");
    }
  });

  it("routes accepted-but-unpaid invites to payment, even after close", () => {
    expect(inviteState({ ...base, confirmed_at: "2026-08-01", registration_closed: true })).toBe("payment_pending");
  });

  it("blocks fresh acceptance once entries close", () => {
    expect(inviteState({ ...base, registration_closed: true })).toBe("closed");
  });

  it("requires the signed-in invitee before offering actions", () => {
    expect(inviteState({ ...base, is_invitee: false })).toBe("needs_login");
    expect(inviteState(base)).toBe("actionable");
  });
});

describe("fees and routing", () => {
  it("ignores the fee amount when payment is not required", () => {
    expect(inviteFeeCents({ ...base, entry_fee_cents: 15000 })).toBe(0);
    expect(inviteFeeCents({ ...base, entry_fee_cents: 15000, payment_required: true })).toBe(15000);
  });

  it("sends payable acceptances into the existing payment flow", () => {
    expect(afterAcceptPath("c1", "pending_eft")).toBe("/club-champs/c1?pay=1");
    expect(afterAcceptPath("c1", "pending_payment")).toBe("/club-champs/c1?pay=1");
    expect(afterAcceptPath("c1", "paid")).toBe("/club-champs/c1");
  });
});
