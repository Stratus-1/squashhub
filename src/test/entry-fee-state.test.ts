import { describe, it, expect } from "vitest";
import { deriveEntryFeeState as d, canReportPayment, canChoosePayment } from "@/lib/tournaments/entry-fee-state";

const L = { chargeLoaded: true };
describe("entry fee state (all clubs)", () => {
  it("unpaid entry offers choices and claim", () => {
    const s = d({ status: "pending_payment", fee_status: "due" }, null, 3400, L);
    expect(s).toEqual({ kind: "unpaid" });
    expect(canChoosePayment(s) && canReportPayment(s)).toBe(true);
  });
  it("on account with a live charge stays charged; no claim, no choices", () => {
    const s = d({ fee_settled_via: "account", fee_status: "on_account", fee_payment_id: "f" }, { id: "f", amount: 34, paid: false }, 3400, L);
    expect(s).toEqual({ kind: "account_charged", amountCents: 3400, mismatch: false });
    expect(canReportPayment(s) || canChoosePayment(s)).toBe(false);
  });
  it("flags a charge amount that differs from what is due", () => {
    expect(d({ fee_settled_via: "account", fee_payment_id: "f" }, { id: "f", amount: "100", paid: false }, 3400, L))
      .toMatchObject({ kind: "account_charged", amountCents: 10000, mismatch: true });
  });
  it("on-account flag with no live charge is never shown as charged", () => {
    const s = d({ fee_settled_via: "account", fee_status: "on_account" }, null, 3400, L);
    expect(s).toEqual({ kind: "account_unverified" });
    expect(canChoosePayment(s)).toBe(false);
  });
  it("charge settled → paid", () => {
    expect(d({ fee_settled_via: "account", fee_payment_id: "f" }, { id: "f", amount: 34, paid: true }, 3400, L)).toEqual({ kind: "paid" });
  });
  it("waits while the linked charge is loading", () => {
    expect(d({ fee_settled_via: "account", fee_payment_id: "f" }, undefined, 3400, { chargeLoaded: false })).toBeNull();
  });
  it("paid, waived, free, EFT pending", () => {
    expect(d({ paid_at: "x" }, null, 3400, L)).toEqual({ kind: "paid" });
    expect(d({ fee_status: "waived" }, null, 3400, L)).toEqual({ kind: "waived" });
    expect(d({ status: "registered" }, null, 0, L)).toEqual({ kind: "not_required" });
    const e = d({ status: "pending_eft" }, null, 3400, L);
    expect(canReportPayment(e)).toBe(false);
    expect(canChoosePayment(e)).toBe(true);
  });
});
