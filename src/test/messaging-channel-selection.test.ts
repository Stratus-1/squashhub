import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

// Rule (Willem, 2026-10-16): the messaging section must let the club select
// WhatsApp and/or SMS — two separate switches in the Member messaging card,
// each wired to its own club flag. The per-channel cards below are details
// only (sender, cost, usage) and keep their own toggles hidden.
describe("messaging channel selection", () => {
  const messaging = readFileSync("src/components/club-admin/MessagingCard.tsx", "utf8");
  const clubAdmin = readFileSync("src/pages/ClubAdmin.tsx", "utf8");

  it("offers separate WhatsApp and SMS switches wired to their own flags", () => {
    expect(messaging).toMatch(/checked=\{!!club\?\.whatsapp_enabled\}/);
    expect(messaging).toMatch(/checked=\{!!club\?\.sms_enabled\}/);
  });

  it("no longer sets both channels with one master switch", () => {
    expect(messaging).not.toMatch(/whatsapp_enabled: enabled,\s*sms_enabled: enabled/);
  });

  it("per-channel cards below stay details-only (toggles hidden)", () => {
    const wa = clubAdmin.match(/<WhatsAppBillingCard[^>]*>/)?.[0] ?? "";
    const sms = clubAdmin.match(/<SmsMessagingCard[^>]*>/)?.[0] ?? "";
    expect(wa).toContain("hideToggle");
    expect(sms).toContain("hideToggle");
  });
});
