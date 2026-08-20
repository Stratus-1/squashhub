import { describe, it, expect } from "vitest";
import {
  inviteConfirmSummary,
  resolveInviteRecipients,
  type InviteRegistrationRow,
} from "@/lib/tournaments/invite-recipients";

const regs: InviteRegistrationRow[] = [
  { id: "r1", club_member_id: "m1", status: "invited" },
  { id: "r2", club_member_id: "m2", status: "invited" },
  { id: "r3", club_member_id: "m3", status: "paid" },
  { id: "r4", club_member_id: "m4", status: "cancelled" },
  { id: "r5", club_member_id: null, status: "invited" },
];

describe("selective invitation sends", () => {
  it("sends to exactly one selected recipient", () => {
    const res = resolveInviteRecipients({ mode: "selected", registrations: regs, selectedIds: ["r2"] });
    expect(res.ok && res.rows.map((r) => r.id)).toEqual(["r2"]);
  });

  it("sends to exactly the multiple selected recipients, including already-paid ones", () => {
    const res = resolveInviteRecipients({ mode: "selected", registrations: regs, selectedIds: ["r1", "r3"] });
    expect(res.ok && res.rows.map((r) => r.id)).toEqual(["r1", "r3"]);
  });

  it("de-duplicates repeated selections", () => {
    const res = resolveInviteRecipients({ mode: "selected", registrations: regs, selectedIds: ["r1", "r1"] });
    expect(res.ok && res.rows.length).toBe(1);
  });

  it("fails closed on an empty selection — never falls back to everyone", () => {
    for (const sel of [[], null, undefined]) {
      const res = resolveInviteRecipients({ mode: "selected", registrations: regs, selectedIds: sel as any });
      expect(res.ok).toBe(false);
    }
  });

  it("fails closed on stale or malformed ids rather than sending a wider set", () => {
    const stale = resolveInviteRecipients({ mode: "selected", registrations: regs, selectedIds: ["r1", "gone"] });
    expect(stale.ok).toBe(false);
    const malformed = resolveInviteRecipients({ mode: "selected", registrations: regs, selectedIds: ["   "] });
    expect(malformed.ok).toBe(false);
  });

  it("never resolves a registration without a member id", () => {
    const res = resolveInviteRecipients({ mode: "selected", registrations: regs, selectedIds: ["r5"] });
    expect(res.ok).toBe(false);
  });
});

describe("send-all invitations", () => {
  it("targets everyone still pending a response", () => {
    const res = resolveInviteRecipients({ mode: "all", registrations: regs });
    expect(res.ok && res.rows.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("stops when everyone is registered unless a re-send is confirmed", () => {
    const done: InviteRegistrationRow[] = [{ id: "r3", club_member_id: "m3", status: "paid" }];
    expect(resolveInviteRecipients({ mode: "all", registrations: done }).ok).toBe(false);
    const forced = resolveInviteRecipients({ mode: "all", registrations: done, allowResendAll: true });
    expect(forced.ok && forced.rows.map((r) => r.id)).toEqual(["r3"]);
  });

  it("reports nothing to do when there are no invitees at all", () => {
    const res = resolveInviteRecipients({ mode: "all", registrations: [], allowResendAll: true });
    expect(res.ok).toBe(false);
  });

  it("ignores selected ids entirely in all-mode", () => {
    const res = resolveInviteRecipients({ mode: "all", registrations: regs, selectedIds: ["r1"] });
    expect(res.ok && res.rows.length).toBe(2);
  });
});

describe("confirmation summary", () => {
  it("names a single selected recipient", () => {
    expect(inviteConfirmSummary("selected", ["Willem Pretorius"])).toBe(
      "Send to 1 selected member: Willem Pretorius?",
    );
  });

  it("summarises larger sets", () => {
    expect(inviteConfirmSummary("selected", ["A", "B", "C", "D"])).toMatch(/4 selected members: A, B, C and 1 more/);
    expect(inviteConfirmSummary("all", ["A", "B"])).toMatch(/all 2 invited members/);
  });
});
