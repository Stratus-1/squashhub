import { describe, expect, it, vi } from "vitest";
import { renderChannel } from "../../supabase/functions/_shared/comms-render";
import { tournamentMessageAction, noticeTemplateVariables } from "../../supabase/functions/_shared/match-day-cta";

const send = vi.hoisted(() => vi.fn(async (input) => input));
vi.mock("@/lib/comms/send", () => ({ sendComms: send }));
vi.mock("@/lib/smart-builder/step-handover", () => ({
  entryPayLinks: async () => ({ owing: "https://example.test/i/personal" }),
  emailPayButton: (url: string, label: string) => `<a href="${url}">${label}</a>`,
  payRoute: () => "/club-champs/test?pay=1",
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const data = table === "tournaments" ? { id: "test" }
    : table === "club_champs" ? { payment_required: true, entry_fee_cents: 10000 }
    : table === "club_champs_matches" ? [{ player_a_member_id: "owing", player_b_member_id: "paid" }]
    : [{ club_member_id: "owing", fee_paid_cents: 0 }, { club_member_id: "paid", paid_at: "2026-10-09" }];
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data }), then: (resolve: (v: unknown) => void) => resolve({ data }) };
  return chain;
} } }));
import { sendDrawNotice } from "@/lib/smart-builder/draw-notice";

describe("draw delivery without real sends", () => {
  it("renders personal email and separate pay/tournament WhatsApp URLs for owing players only", async () => {
    await sendDrawNotice("club", "test", "Club champs", "See the new draw", ["email", "whatsapp", "in_app"], undefined, true);
    const campaign = send.mock.calls[0]?.[0];
    expect(campaign).toBeDefined();
    if (!campaign) return;
    const action = tournamentMessageAction({ key: "tournament_view", label: "View", appPath: "/club-champs/test", webUrl: "https://example.test/club-champs/test", hasAction: true }, "https://example.test/md/permanent");
    const vars = { name: "Test Player", ...campaign.memberVars?.owing };
    const email = renderChannel("email", campaign.content.email, vars, action);
    expect(email.body).toContain("Dear Test Player,");
    expect(email.body).toContain("https://example.test/i/personal");
    expect(email.body).toContain("https://example.test/md/permanent");
    expect(email.body).not.toContain("https://example.test/club-champs/test");
    expect(email.body).toContain("padding:11px 20px");
    const wa = renderChannel("whatsapp", campaign.content.whatsapp, vars, action);
    const slots = noticeTemplateVariables(wa.body, wa.url, action.label);
    // The pay link is carried separately (pay_link + pay_token) so the WhatsApp
    // sender can use a tappable "Pay my fee" button; it is never in the body.
    expect(slots.message).not.toContain("Pay my fee: https://example.test/i/personal");
    expect(campaign.memberVars?.owing?.pay_link).toBe("https://example.test/i/personal");
    expect(campaign.memberVars?.owing?.pay_token).toBe("personal");
    expect(slots.message).not.toContain("/md/permanent");
    expect(slots.link).toBe("https://example.test/md/permanent");
    const paid = renderChannel("whatsapp", campaign.content.whatsapp, { name: "Paid Player", ...campaign.memberVars?.paid }, action);
    expect(paid.body).toContain("Your fee has been paid");
    expect(paid.body).not.toContain("/i/personal");
    const inApp = renderChannel("in_app", campaign.content.in_app, vars, action);
    expect(inApp.url).toBe("/club-champs/test");
    expect(inApp.body).not.toContain("/i/personal");
  });
});