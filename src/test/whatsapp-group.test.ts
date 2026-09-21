import { describe, it, expect } from "vitest";
import {
  defaultGroupName,
  groupAutomationActive,
  groupDescriptionText,
  groupInviteRecipients,
  isGroupInviteUrl,
  normaliseGroupInviteUrl,
  tournamentActionUrl,
} from "@/lib/tournaments/whatsapp-group";

describe("tournament whatsapp group", () => {
  it("accepts real group invite links and rejects anything else", () => {
    expect(normaliseGroupInviteUrl("https://chat.whatsapp.com/AbCd1234efGh")).toBe(
      "https://chat.whatsapp.com/AbCd1234efGh",
    );
    expect(normaliseGroupInviteUrl("chat.whatsapp.com/AbCd1234efGh")).toBe(
      "https://chat.whatsapp.com/AbCd1234efGh",
    );
    expect(normaliseGroupInviteUrl("https://chat.whatsapp.com/AbCd1234efGh.")).toBe(
      "https://chat.whatsapp.com/AbCd1234efGh",
    );
    expect(isGroupInviteUrl("https://wa.me/27821234567")).toBe(false);
    expect(isGroupInviteUrl("")).toBe(false);
  });

  it("names the group for whichever tenant owns the tournament", () => {
    expect(defaultGroupName("Club Champs 2026", "CSIR")).toBe("CSIR — Club Champs 2026");
    expect(defaultGroupName("CSIR Bells Open", "CSIR")).toBe("CSIR Bells Open");
    expect(defaultGroupName("Gauteng Open", "Squash Gauteng")).toBe("Squash Gauteng — Gauteng Open");
  });

  it("puts both deep links in the description and says the group is not an entry", () => {
    const text = groupDescriptionText({
      champId: "abc",
      tournamentName: "Bells Open",
      ownerName: "CSIR",
      subdomain: "csir",
    });
    expect(text).toContain("https://csir.squashhub.co.za/t/abc/enter");
    expect(text).toContain("https://csir.squashhub.co.za/t/abc/withdraw");
    expect(text).toMatch(/does not enter you/i);
  });

  it("builds tenant-aware action links", () => {
    expect(tournamentActionUrl("x1", "withdraw", "gordonsbay")).toBe(
      "https://gordonsbay.squashhub.co.za/t/x1/withdraw",
    );
  });

  it("only invites entrants who actually entered", () => {
    const regs = [
      { club_member_id: "a", status: "paid" },
      { club_member_id: "b", status: "invited" },
      { club_member_id: "c", status: "cancelled" },
      { club_member_id: "d", status: "pending_payment" },
    ];
    expect(groupInviteRecipients(regs).map((r) => r.club_member_id)).toEqual(["a", "d"]);
    expect(groupInviteRecipients(regs, { paidOnly: true }).map((r) => r.club_member_id)).toEqual(["a"]);
  });

  it("stops automation once the group is closed or the tournament is over", () => {
    const g = { status: "active" as const, invite_url: "https://chat.whatsapp.com/AbCd1234efGh" };
    expect(groupAutomationActive(g, "in_progress")).toBe(true);
    expect(groupAutomationActive(g, "completed")).toBe(false);
    expect(groupAutomationActive({ ...g, status: "closed" }, "in_progress")).toBe(false);
    expect(groupAutomationActive({ ...g, invite_url: null }, "in_progress")).toBe(false);
  });
});
