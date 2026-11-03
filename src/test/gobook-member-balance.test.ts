import { describe, expect, it } from "vitest";
import { goBookBalanceTone, memberGoBookBalance, goBookLightsAccounts } from "@/lib/gobook-member-balance";

describe("GoBook member-facing balance display", () => {
  it("excludes cached POS and Subscription balances while preserving Lights credit", () => {
    const accounts = goBookLightsAccounts([
      { accountName: "Lights Account", balance: -25.6 },
      { accountName: "POS Account", balance: -100 },
      { accountName: "Subscription Account", balance: 4950 },
    ]);
    expect(accounts).toEqual([{ accountName: "Lights Account", balance: -25.6 }]);
    expect(memberGoBookBalance(accounts[0].balance)).toBe(25.6);
  });
  it("shows Court Manager credit (negative raw) as a positive member balance", () => {
    expect(memberGoBookBalance(-298.36)).toBe(298.36);
  });

  it("shows an amount the member owes as negative", () => {
    expect(memberGoBookBalance(40)).toBe(-40);
  });

  it("keeps zero at zero", () => {
    expect(memberGoBookBalance(0)).toBe(0);
  });

  it("colours credit green, owing red and zero neutral", () => {
    expect(goBookBalanceTone(298.36)).toBe("success");
    expect(goBookBalanceTone(-40)).toBe("destructive");
    expect(goBookBalanceTone(0)).toBe("muted");
  });
});
