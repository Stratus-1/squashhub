import { describe, it, expect } from "vitest";
import {
  afterAcceptPath,
  buildInviteTestUrl,
  inviteTestPath,
  inviteVerificationKind,
  inviteVerificationLabel,
  isInviteVerificationComplete,
  buildInviteUrl,
  inviteFeeCents,
  inviteLoginPath,
  inviteSignupPath,
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

  it("lets the token holder respond without a login", () => {
    expect(inviteState({ ...base, is_invitee: false, can_respond_public: true })).toBe("actionable");
    expect(inviteState(base)).toBe("actionable");
  });

  it("falls back to login only for legacy payloads without the public path", () => {
    expect(inviteState({ ...base, is_invitee: false })).toBe("needs_login");
  });

  it("keeps revoked/closed handling ahead of the public response path", () => {
    expect(inviteState({ ...base, can_respond_public: true, revoked: true })).toBe("revoked");
    expect(inviteState({ found: true, status: "invited", can_respond_public: true, registration_closed: true })).toBe("closed");
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

describe("recipient verification", () => {
  it("asks a public visitor for the token-bound detail", () => {
    expect(inviteVerificationKind({ ...base, is_invitee: false, verification_kind: "phone_last4" })).toBe("phone_last4");
    expect(inviteVerificationKind({ ...base, is_invitee: false, verification_kind: "surname" })).toBe("surname");
    expect(inviteVerificationLabel("phone_last4")).toMatch(/last 4/i);
  });

  it("never asks the already-proven signed-in invitee", () => {
    expect(inviteVerificationKind({ ...base, is_invitee: true, verification_kind: "phone_last4" })).toBe("none");
  });

  it("blocks obviously incomplete answers client-side", () => {
    expect(isInviteVerificationComplete("phone_last4", "12")).toBe(false);
    expect(isInviteVerificationComplete("phone_last4", "4821")).toBe(true);
    expect(isInviteVerificationComplete("surname", "P")).toBe(false);
    expect(isInviteVerificationComplete("surname", " Pretorius ")).toBe(true);
    expect(isInviteVerificationComplete("none", "")).toBe(true);
  });
});

describe("organiser test invitations", () => {
  it("uses a non-mutating test link that carries no invite token", () => {
    expect(inviteTestPath("champ-1")).toBe("/i/test/champ-1");
    const url = buildInviteTestUrl("champ-1", "nsc");
    expect(url).toBe("https://nsc.squashhub.co.za/i/test/champ-1");
    expect(url).not.toMatch(/token/);
  });
});

describe("unclaimed memberships", () => {
  it("asks the invitee to create an account when the membership has no login", () => {
    expect(
      inviteState({ found: true, status: "invited", is_invitee: false, member_has_account: false }),
    ).toBe("needs_signup");
  });

  it("asks for sign-in when the membership already has a login", () => {
    expect(
      inviteState({ found: true, status: "invited", is_invitee: false, member_has_account: true }),
    ).toBe("needs_login");
  });

  it("keeps the invite context in the signup round-trip", () => {
    expect(inviteSignupPath("tok")).toBe("/auth?intent=claim&redirectTo=%2Fi%2Ftok");
  });
});
