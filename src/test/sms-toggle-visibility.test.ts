import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

// Rule: the messaging screen must give clubs a visible SMS on/off switch of
// their own (separate from the master "Send messages to members' phones"
// switch), because WhatsApp and SMS are stored as separate club flags.
describe("messaging screen SMS switch", () => {
  const clubAdmin = readFileSync("src/pages/ClubAdmin.tsx", "utf8");
  const smsCard = readFileSync("src/components/club-admin/SmsMessagingCard.tsx", "utf8");

  it("renders the SMS card with its own switch visible (no hideToggle)", () => {
    const usage = clubAdmin.match(/<SmsMessagingCard[^>]*>/)?.[0] ?? "";
    expect(usage).toContain("clubId");
    expect(usage).not.toContain("hideToggle");
  });

  it("the SMS card offers a Send SMS switch wired to the club's sms_enabled flag", () => {
    expect(smsCard).toContain("Send SMS for this club");
    expect(smsCard).toMatch(/checked=\{!!club\?\.sms_enabled\}/);
    expect(smsCard).toMatch(/save\.mutate\(\{ sms_enabled: v \}\)/);
  });
});
