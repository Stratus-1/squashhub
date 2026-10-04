import { describe, it, expect } from "vitest";
import {
  EMPTY_INVITE_AUDIENCE, emailEntryButton, inviteRowStatus, memberMatchesTournamentGender,
  neutraliseInviteCategories, personaliseInvite, personaliseInviteEmailHtml, planInviteRows, type StepInviteAudience,
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

describe("invitation category wording", () => {
  it("does not promise that a recipient can enter every category in an older saved invite", () => {
    const old = "Hi there,\n\nYou can enter: A - Mens 1st 2nd · Singles, B - Mens 3rd 4th · Singles, Ladies - 1st 4th · Singles.\n\nEnter here: [entry link added when the tournament is created]";
    const text = personaliseInvite(old, "Willem", "https://example.com/i/token");
    expect(text).toContain("Categories in this tournament are: A - Mens 1st 2nd · Singles, B - Mens 3rd 4th · Singles, Ladies - 1st 4th · Singles.");
    expect(text).not.toContain("You can enter:");
    const html = personaliseInviteEmailHtml(old, "Willem", "https://example.com/i/token");
    expect(html).toContain("Categories in this tournament are:");
    expect(html).toContain(emailEntryButton("https://example.com/i/token", "Enter here"));
  });

  it("keeps unrelated custom wording and already-neutral invitations unchanged", () => {
    const custom = "Hi there,\n\nAsk the organiser which group applies to you.";
    expect(neutraliseInviteCategories(custom)).toBe(custom);
    const neutral = "Categories in this tournament are: Group A, Group B.";
    expect(neutraliseInviteCategories(neutral)).toBe(neutral);
  });
});

/* ── email body: entry link becomes a button ── */
describe("personaliseInviteEmailHtml", () => {
  const tpl = "Hi there,\n\nYou are invited to Open S D at CSIR.\n\nEnter here: [entry link added when the tournament is created]\n\nRegards";
  const link = "https://csi.squashhub.co.za/i/abc";

  it("replaces the raw entry-link line with the Enter here button", () => {
    const html = personaliseInviteEmailHtml(tpl, "Albert Smith", link);
    expect(html).toContain(emailEntryButton(link, "Enter here"));
    expect(html).not.toMatch(/Enter here:[^<]*https:/);
  });

  it("keeps the rest of the message as paragraphs", () => {
    const html = personaliseInviteEmailHtml(tpl, "Ben", link);
    expect(html).toContain("You are invited to Open S D at CSIR.");
    expect(html).toContain("Regards");
    expect(html).toContain("Hi Ben,");
  });

  it("button links to the recipient's personal link", () => {
    const html = personaliseInviteEmailHtml(tpl, "Cara", link);
    expect(html).toContain(`href="${link}"`);
  });

  it("escapes message text; no button when the message carries no entry link", () => {
    const html = personaliseInviteEmailHtml("A<b>", "Dan", link);
    expect(html).toContain("A&lt;b&gt;");
    expect(html).not.toContain("v:roundrect");
    // a message without a link line falls back to the sign-in hint, still no raw button
    const hinted = personaliseInviteEmailHtml(tpl, "Dan", null);
    expect(hinted).not.toContain("v:roundrect");
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
      existing: [{ club_member_id: "b", status: "invited" }],
      feeCents: 0, paymentRequired: false,
    });
    expect(plan.insert).toEqual(["a"]);
    expect(plan.skip).toEqual(["b"]);
    expect(plan.reopen).toEqual([]);
  });

  it("declined/cancelled members are re-invited, clearing their decline", () => {
    const plan = planInviteRows({
      memberIds: ["a"],
      existing: [{ club_member_id: "a", status: "declined" }],
      feeCents: 0, paymentRequired: false,
    });
    expect(plan.reopen).toEqual(["a"]);
    expect(plan.skip).toEqual([]);
  });

  it("registered/paid members are never touched", () => {
    const plan = planInviteRows({
      memberIds: ["a", "b"],
      existing: [
        { club_member_id: "a", status: "paid", confirmed_at: "2026-01-01" },
        { club_member_id: "b", status: "waived", paid_at: "2026-01-01" },
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
