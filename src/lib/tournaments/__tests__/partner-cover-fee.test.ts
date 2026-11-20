import { describe, expect, it } from "vitest";
import { partnerCoverCents } from "../entry-fee";

// No Frills Doubles package: 1 category R210, 2 categories R310.
const tiers = { "1": 21000, "2": 31000 };

describe("partnerCoverCents (package-priced doubles)", () => {
  it("charges R100 when the partner already paid R210 for their first category", () => {
    // Zelda paid R210 for Ladies; Jan covering her Mixed (her 2nd category) pays R100.
    expect(partnerCoverCents(tiers, 2, 21000)).toBe(10000);
  });

  it("charges R210 when the partner has paid nothing yet (partner then owes R100)", () => {
    // Ebert covered Reinhardt's Mens before Reinhardt paid; Reinhardt owes R310 - R210 = R100.
    expect(partnerCoverCents(tiers, 2, 0)).toBe(21000);
  });

  it("charges R210 for a partner's only category", () => {
    expect(partnerCoverCents(tiers, 1, 0)).toBe(21000);
  });

  it("charges nothing when the partner already paid the full package", () => {
    expect(partnerCoverCents(tiers, 2, 31000)).toBe(0);
  });
});
