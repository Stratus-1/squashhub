import { describe, it, expect } from "vitest";
import { computeAccountChargeGate as g, debitSwitchFor, parseAccountLimit, barChargeErrorMessage } from "@/lib/account-charge-gate";

const none = { fees: [], hasMandate: false };

describe("bar/shop account charge gate", () => {
  it("prepaid credit covers purchase", () => expect(g({ currentOwing: -100, purchase: 60, ...none })).toMatchObject({ allowed: true, projectedOwing: -40 }));
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

import { previewBasketCharge as pb } from "@/lib/account-charge-gate";
describe("early basket warning", () => {
  const p = (o: any) => ({ bar_gated: true, shop_gated: false, current_owing: 0, allowance: 0, ...o });
  it("R0 balance warns even before items are added", () => expect(pb({ preview: p({}), lines: [] }).blocked).toBe(true));
  it("negative available credit warns with empty basket", () => expect(pb({ preview: p({ current_owing: 40 }), lines: [] }).blocked).toBe(true));
  it("positive credit, empty basket → no warning", () => expect(pb({ preview: p({ current_owing: -40 }), lines: [] }).blocked).toBe(false));
  it("both switches on → no warning at R0", () => expect(pb({ preview: p({ bar_gated: false }), lines: [] }).blocked).toBe(false));
  it("positive but insufficient warns; sufficient does not", () => {
    expect(pb({ preview: p({ current_owing: -10 }), lines: [{ division: "bar", total: 15 }] }).blocked).toBe(true);
    expect(pb({ preview: p({ current_owing: -10 }), lines: [{ division: "bar", total: 10 }] }).blocked).toBe(false);
  });
  it("warns when gated bar basket exceeds", () => expect(pb({ preview: p({}), lines: [{ division: "bar", total: 20 }] }).blocked).toBe(true));
  it("recalculates as basket changes", () => {
    const pr = p({ current_owing: -25 });
    expect(pb({ preview: pr, lines: [{ division: "bar", total: 20 }] }).blocked).toBe(false);
    expect(pb({ preview: pr, lines: [{ division: "bar", total: 30 }] }).blocked).toBe(true);
  });
  it("recurring allowance covers total → no warning", () =>
    expect(pb({ preview: p({ current_owing: 450, allowance: 500 }), lines: [{ division: "bar", total: 40 }] }).blocked).toBe(false));
  it("shop switch ON → no warning for shop-only basket", () => expect(pb({ preview: p({ current_owing: 900 }), lines: [{ division: "shop", total: 50 }] }).blocked).toBe(false));
  it("mixed basket with gated line checks whole total", () =>
    expect(pb({ preview: p({ current_owing: -30 }), lines: [{ division: "shop", total: 25 }, { division: "bar", total: 10 }] }).blocked).toBe(true));
  it("no preview (unauthorised/error) fails open", () => expect(pb({ preview: null, lines: [{ total: 99 }] }).blocked).toBe(false));
});
