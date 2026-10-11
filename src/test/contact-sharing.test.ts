import { describe, it, expect, beforeEach } from "vitest";
import { CONTACT_CONSENT_LABEL, phoneLinks, readActivationConsent, rememberActivationConsent, clearActivationConsent } from "@/lib/contact-sharing";
import { matchDetailsHtml, matchDetailsText } from "@/lib/smart-builder/draw-match-details";

describe("opponent contact sharing (client)", () => {
  beforeEach(() => sessionStorage.clear());
  it("uses the approved wording", () => {
    expect(CONTACT_CONSENT_LABEL).toMatch(/actual scheduled opponents/);
    expect(CONTACT_CONSENT_LABEL).toMatch(/tournaments, leagues and ladder challenges/);
  });
  it("activation consent is never assumed and is per token", () => {
    expect(readActivationConsent("tok-aaaaaaaaaaaaaaaa")).toBeNull();
    rememberActivationConsent("tok-aaaaaaaaaaaaaaaa", { share: true, adult: true });
    expect(readActivationConsent("tok-bbbbbbbbbbbbbbbb")).toBeNull();
    clearActivationConsent("tok-aaaaaaaaaaaaaaaa");
    expect(readActivationConsent("tok-aaaaaaaaaaaaaaaa")).toBeNull();
  });
  it("builds call/WhatsApp links", () => {
    expect(phoneLinks("082 000 0001")).toEqual({ tel: "tel:0820000001", whatsapp: "https://wa.me/27820000001" });
  });
  it("the shared match card never carries a phone number itself", () => {
    const d = [{ matchId: "m", category: "Men", round: "Round 1", opponent: "B", partner: null, when: "x", time: "x", court: "x", venue: "x", state: "scheduled" as const, status: "Not yet played" }];
    expect(matchDetailsHtml(d)).not.toMatch(/\+27|0\d{9}/);
    expect(matchDetailsText(d)).not.toMatch(/\+27|0\d{9}/);
  });
});
