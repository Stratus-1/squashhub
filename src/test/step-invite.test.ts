import { describe, it, expect } from "vitest";
import {
  EMPTY_INVITE_AUDIENCE, inviteRowStatus, memberMatchesTournamentGender,
  personaliseInvite, planInviteRows, type StepInviteAudience,
} from "@/lib/smart-builder/step-invite";
import { resolveInviteAudience, type AudienceMemberRow } from "@/lib/tournaments/invite-audience";

/* ── personaliseInvite ── */
describe("personaliseInvite", () => {
  const tpl = "Hi there,\n\nYou are invited to Open S D.\n[entry link added when the tournament is created]\nRegards";

  it("greets the recipient by first name", () => {
    expect(personaliseInvite(tpl, "Albert Smith", "https://x/i/abc")).toContain("Hi Albert,");
  });

  it("replaces the entry-link placeholder with the personal link", () => {
    const out = personaliseInvite(tpl, "Ben", "https://x/i/xyz");
    expect(out).toContain("https://x/i/xyz");
    expect(out).not.toContain("[entry link");
  });

  it("falls back to a sign-in hint when no link exists yet", () => {
    expect(personaliseInvite(tpl, "Cara")).toContain("open the tournament in SquashHub");
  });

  it("keeps the template intact when the greeting line is absent", () => {
    expect(personaliseInvite("No greeting here", "Dan")).toContain("No greeting here");
  });
});

/* ── inviteRowStatus / planInviteRows ── */
describe("planInviteRows", () => {
  it("fee + pay-first tournaments invite as pending_payment", () => {
    expect(inviteRowStatus(15000, true)).toBe("pending_payment");
    expect(inviteRowStatus(15000, false)).toBe("invited");
    expect(inviteRowStatus(0, true)).toBe("invited");
  });

  it("new members get insert rows; already-invited members are skipped", () => {
    const plan = planInviteRows({
      memberIds: ["a", "b"],
      existing: [{ id: "r1", club_member_id: "b", status: "invited" }],
      feeCents: 0, paymentRequired: false,
    });
    expect(plan.insert).toEqual(["a"]);
    expect(plan.skip).toEqual(["b"]);
    expect(plan.reopen).toEqual([]);
  });

  it("declined/cancelled members are re-invited, clearing their decline", () => {
    const plan = planInviteRows({
      memberIds: ["a"],
      existing: [{ id: "r1", club_member_id: "a", status: "declined", declined_at: "2026-01-01" }],
      feeCents: 0, paymentRequired: false,
    });
    expect(plan.reopen).toEqual(["a"]);
    expect(plan.skip).toEqual([]);
  });

  it("registered/paid members are never touched", () => {
    const plan = planInviteRows({
      memberIds: ["a", "b"],
      existing: [
        { id: "r1", club_member_id: "a", status: "paid", confirmed_at: "2026-01-01" },
        { id: "r2", club_member_id: "b", status: "waived", paid_at: "2026-01-01" },
      ],
      feeCents: 15000, paymentRequired: true,
    });
    expect(plan.insert).toEqual([]);
    expect(plan.reopen).toEqual([]);
    expect(plan.reopenUnanswered).toEqual([]);
    expect(plan.skip.sort()).toEqual(["a", "b"]);
  });
});

/* ── gender matcher ── */
describe("memberMatchesTournamentGender", () => {
  it("mixed/open tournaments admit everyone; null gender is not excluded", () => {
    expect(memberMatchesTournamentGender("male", "mixed")).toBe(true);
    expect(memberMatchesTournamentGender(null, "men")).toBe(true);
    expect(memberMatchesTournamentGender("female", "men")).toBe(false);
    expect(memberMatchesTournamentGender("male", "ladies")).toBe(false);
    expect(memberMatchesTournamentGender("female", "ladies")).toBe(true);
  });
});

/* ── audience resolution through the shared resolver ── */
describe("invite audience resolution", () => {
  const members: AudienceMemberRow[] = [
    { id: "m1", status: "active", role: "member" },
    { id: "m2", status: "active", role: "member" },
    { id: "v1", status: "active", role: "visitor" },
  ];
  const aud = (over: Partial<StepInviteAudience>): StepInviteAudience => ({ ...EMPTY_INVITE_AUDIENCE, ...over });

  it("clubs mode resolves only ticked clubs via server member lists", () => {
    const res = resolveInviteAudience({
      mode: "clubs", members, clubIds: ["c1"],
      memberIdsByClub: new Map([["c1", ["x1", "x2"]], ["c2", ["x3"]]]),
      trustedMemberIds: new Set(["x1", "x2", "x3"]),
    });
    expect(res.memberIds.sort()).toEqual(["x1", "x2"]);
  });

  it("individuals mode never widens beyond the picked ids", () => {
    const res = resolveInviteAudience({ mode: "individuals", members, individualIds: ["m2"] });
    expect(res.memberIds).toEqual(["m2"]);
  });

  it("leagues mode uses the picked league's registrations only", () => {
    const res = resolveInviteAudience({
      mode: "leagues", members, leagueIds: ["L1"],
      registrationsByLeague: new Map([["L1", ["m1"]], ["L2", ["m2"]]]),
    });
    expect(res.memberIds).toEqual(["m1"]);
  });

  it("audience state round-trips through the lifecycle shape", () => {
    const a = aud({ mode: "individuals", individualIds: ["m1", "m2"] });
    const restored: StepInviteAudience = {
      mode: a.mode, leagueIds: a.leagueIds, clubIds: a.clubIds, individualIds: a.individualIds,
    };
    expect(restored).toEqual(a);
  });
});
