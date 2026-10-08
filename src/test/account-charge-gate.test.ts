import { describe, it, expect } from "vitest";
import { computeAccountChargeGate as g, debitSwitchFor, parseAccountLimit, barChargeErrorMessage } from "@/lib/account-charge-gate";

const none = { fees: [], hasMandate: false };

describe("bar/shop account charge gate", () => {
  it("prepaid credit covers purchase", () => expect(g({ currentOwing: -100, purchase: 60, ...none })).toMatchObject({ allowed: true, projectedOwing: 40 - 80 }));
  it("exactly zero after purchase is allowed", () => expect(g({ currentOwing: -50, purchase: 50, ...none }).allowed).toBe(true));
  it("zero balance, no arrangement → refused", () => expect(g({ currentOwing: 0, purchase: 30, ...none })).toMatchObject({ allowed: false, shortfall: 30 }));
  it("arrears without arrangement → refused", () => expect(g({ currentOwing: 200, purchase: 10, ...none })).toMatchObject({ allowed: false, shortfall: 210 }));
  it("recurring arrangement allowance", () => {
    const base = { currentOwing: 450, fees: [{ amount: 500 }], hasMandate: true };
    expect(g({ ...base, purchase: 40 }).allowed).toBe(true);
    expect(g({ ...base, purchase: 60 })).toMatchObject({ allowed: false, shortfall: 10 });
  });
  it("suspended/no mandate → allowance 0", () => expect(g({ currentOwing: 0, purchase: 1, fees: [{ amount: 500 }], hasMandate: false }).allowance).toBe(0));
  it("bar vs shop switch", () => {
    expect(debitSwitchFor("shop")).toBe("shop");
    expect(debitSwitchFor("bar")).toBe("bar");
    expect(debitSwitchFor("restaurant")).toBe("bar");
    expect(debitSwitchFor(null)).toBe("bar");
  });
  it("parses backend refusal", () => {
    const e = { message: "ACCOUNT_LIMIT|30.00|30.00|0.00" };
    expect(parseAccountLimit(e)).toEqual({ shortfall: 30, projectedOwing: 30, allowance: 0 });
    expect(barChargeErrorMessage(e, "x")).toContain("Pay by card, or top up");
    expect(barChargeErrorMessage({ message: "other" }, "x")).toBe("other");
  });
});
