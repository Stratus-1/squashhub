import { describe, it, expect } from "vitest";
import { inviteFeePriceLabel, inviteOwedLabel } from "@/lib/tournaments/invite-link";

const tiers = { "1": 21000, "2": 31000 };

describe("invitation price line", () => {
  it("lists the package prices: one category R210, two categories R310", () => {
    const label = inviteFeePriceLabel(31000, tiers);
    expect(label).toContain("1 category R210.00");
    expect(label).toContain("R310.00");
    expect(label).not.toContain("R100");
  });
  it("shows the ticked categories' price when there is no package pricing", () => {
    expect(inviteFeePriceLabel(21000, null)).toBe("R210.00 entry fee");
  });
  it("shows no entry fee for free tournaments", () => {
    expect(inviteFeePriceLabel(0, null)).toBe("No entry fee");
  });
});

describe("invitation still-to-pay line", () => {
  it("is hidden before the player has entered", () => {
    expect(inviteOwedLabel({ entered: false, freeTournament: false, owedCents: 21000 })).toBeNull();
  });
  it("shows R100 after a partner covered one of two categories (R310 - R210)", () => {
    expect(inviteOwedLabel({ entered: true, freeTournament: false, owedCents: 10000, ownPriceCents: 31000 })).toBe("Still to pay: R100.00");
  });
  it("says paid once the fee is settled", () => {
    expect(inviteOwedLabel({ entered: true, freeTournament: false, owedCents: 0, settled: true })).toBe("Your entry fee is paid");
  });
  it("says nothing is left when a partner covered everything", () => {
    expect(inviteOwedLabel({ entered: true, freeTournament: false, owedCents: 0 })).toBe("Nothing left to pay");
  });
  it("flags a total that includes the partner's fee", () => {
    expect(inviteOwedLabel({ entered: true, freeTournament: false, owedCents: 42000, ownPriceCents: 21000 })).toBe("Still to pay: R420.00 (includes your partner's fee)");
  });
  it("is hidden while the amount is still loading", () => {
    expect(inviteOwedLabel({ entered: true, freeTournament: false, owedCents: null })).toBeNull();
  });
});
