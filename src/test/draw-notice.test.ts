import { describe, expect, it } from "vitest";
import { DEFAULT_DRAW_NOTICE, drawNoticeContent, drawNoticeRecipients, feeStatusFor, composeDrawNoticeVars } from "@/lib/smart-builder/draw-notice";

describe("editable draw notices", () => {
  it("sends the edited wording only through selected channels", () => {
    const content = drawNoticeContent("Round 1", "New wording\nSee you at <court>", ["in_app", "email"]);
    expect(content.in_app.body).toBe("New wording\nSee you at <court>");
    expect(content.email.body).toBe("<p>Dear {{name}},</p><p>New wording<br>See you at &lt;court&gt;</p>");
    expect(content).not.toHaveProperty("whatsapp");
    expect(content).not.toHaveProperty("sms");
  });
  it("deduplicates players and partners and excludes finished/cancelled matches", () => {
    expect(drawNoticeRecipients([
      { player_a_member_id: "a", player_b_member_id: "b", partner_a_member_id: "c", partner_b_member_id: "d" },
      { player_a_member_id: "a", bye_member_id: "e" },
      { player_a_member_id: "f", status: "cancelled" },
      { player_a_member_id: "g", status: "completed" },
    ])).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("keeps default wording independent of unknown dates or opponents", () => {
    expect(DEFAULT_DRAW_NOTICE).toContain("first-round match");
    expect(DEFAULT_DRAW_NOTICE).not.toContain("play by");
  });
  it("works out paid vs outstanding fees per player", () => {
    const st = feeStatusFor(20000, [
      { club_member_id: "a", paid_at: "2026-10-01" },
      { club_member_id: "b", fee_paid_cents: 5000 },
      { club_member_id: "c", fee_paid_cents: 20000 },
    ]);
    expect(st.a.owes).toBe(false);
    expect(st.b).toEqual({ owes: true, outstanding: 15000 });
    expect(st.c.owes).toBe(false);
    expect(feeStatusFor(0, [{ club_member_id: "a" }])).toEqual({});
  });
  it.each(["paid", "waived", "on_account", "not_required"])("does not claim a verified receipt from %s readiness alone", (fee_status) => {
    const ctx = { tournamentName: "Champs", names: { a: "Player" }, matches: [], categoryOf: () => "Singles", courts: {}, bookings: {}, clubVenue: "Club" };
    const status = feeStatusFor(10000, [{ club_member_id: "a", fee_status }]);
    const { vars } = composeDrawNoticeVars("a", "Saved wording", ctx, { fee: 10000, status, links: {} }, "tournament");
    expect(vars.personal_message).not.toContain("Your fee has been paid");
    expect(vars.personal_message_html).not.toContain("Your fee has been paid");
  });
});
