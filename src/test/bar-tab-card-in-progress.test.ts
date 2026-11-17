import { describe, it, expect } from "vitest";
import { tabAwaitingCardPayment } from "@/lib/bar/cancel-tab-card-payment";

describe("tabAwaitingCardPayment", () => {
  it("is true while an online card checkout is unconfirmed", () => {
    expect(tabAwaitingCardPayment({ status: "closing", settled_method: "online" })).toBe(true);
  });
  it("is false for an open tab, so it can be paid", () => {
    expect(tabAwaitingCardPayment({ status: "open", settled_method: null })).toBe(false);
  });
  it("is false while waiting for cash or the card machine at the bar", () => {
    expect(tabAwaitingCardPayment({ status: "closing", settled_method: "terminal" })).toBe(false);
    expect(tabAwaitingCardPayment({ status: "closing", settled_method: "cash" })).toBe(false);
  });
});
