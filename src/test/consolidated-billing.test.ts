import { describe, it, expect } from "vitest";
import {
  addDays,
  buildConsolidatedInvoice,
  isFirstOfMonth,
  isSubscriptionDue,
  monthStartIso,
  previousMonthRange,
} from "../../supabase/functions/run-subscription-billing/consolidated";

const sub = (over: Partial<Parameters<typeof buildConsolidatedInvoice>[0]["subscription"]> = {}) => ({
  due: true,
  planName: "Club Plan",
  billingCycle: "monthly",
  memberCount: 50,
  pricePerMember: 12,
  amount: 600,
  periodStart: "2026-09-01",
  periodEnd: "2026-10-01",
  ...over,
});

const wa = (count = 40, amount = 18) => ({
  messageCount: count,
  amount,
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  utilityCount: count,
});

describe("billing month helpers", () => {
  it("returns the first of the billing month", () => {
    expect(monthStartIso(new Date("2026-09-17T10:00:00Z"))).toBe("2026-09-01");
  });

  it("returns the previous calendar month for WhatsApp arrears", () => {
    expect(previousMonthRange(new Date("2026-09-01T00:00:00Z"))).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
    expect(previousMonthRange(new Date("2026-01-05T00:00:00Z"))).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
  });

  it("only charges the subscription once the next period has started", () => {
    expect(isSubscriptionDue("2026-09-01", "2026-09-01")).toBe(true);
    expect(isSubscriptionDue("2026-09-01", "2026-09-15")).toBe(true);
    // 6-monthly club whose next renewal is March — no subscription line in Oct.
    expect(isSubscriptionDue("2027-03-01", "2026-10-01")).toBe(false);
  });
});

describe("consolidated invoice", () => {
  it("monthly club with no WhatsApp usage bills subscription only", () => {
    const r = buildConsolidatedInvoice({ subscription: sub(), whatsapp: null, vatRate: 0.15 });
    expect(r.skip).toBe(false);
    expect(r.kind).toBe("subscription");
    expect(r.lineItems).toHaveLength(1);
    expect(r.subtotal).toBe(600);
    expect(r.vatAmount).toBe(90);
    expect(r.total).toBe(690);
  });

  it("monthly club with WhatsApp usage bills one combined invoice", () => {
    const r = buildConsolidatedInvoice({ subscription: sub(), whatsapp: wa(40, 18), vatRate: 0.15 });
    expect(r.kind).toBe("combined");
    expect(r.lineItems.map((l) => l.kind)).toEqual(["subscription", "whatsapp"]);
    expect(r.subscriptionAmount).toBe(600);
    expect(r.whatsappAmount).toBe(18);
    expect(r.whatsappMessageCount).toBe(40);
    expect(r.subtotal).toBe(618);
    expect(r.total).toBe(710.7);
  });

  it("6-monthly club in a non-renewal month with usage bills WhatsApp only", () => {
    const r = buildConsolidatedInvoice({
      subscription: sub({ due: false, billingCycle: "biannual", amount: 3420 }),
      whatsapp: wa(10, 4.5),
      vatRate: 0.15,
    });
    expect(r.kind).toBe("whatsapp");
    expect(r.subscriptionAmount).toBe(0);
    expect(r.lineItems).toHaveLength(1);
    expect(r.subtotal).toBe(4.5);
    expect(r.total).toBe(+(4.5 + r.vatAmount).toFixed(2));
  });

  it("6-monthly club in its renewal month bills the whole upfront period plus usage", () => {
    const r = buildConsolidatedInvoice({
      subscription: sub({ billingCycle: "biannual", amount: 3420, periodEnd: "2027-03-01" }),
      whatsapp: wa(5, 2.25),
      vatRate: 0.15,
    });
    expect(r.kind).toBe("combined");
    expect(r.subscriptionAmount).toBe(3420);
    expect(r.lineItems[0].period_end).toBe("2027-03-01");
    expect(r.subtotal).toBe(3422.25);
  });

  it("annual club in a non-renewal month with no usage produces no invoice", () => {
    const r = buildConsolidatedInvoice({
      subscription: sub({ due: false, billingCycle: "annual", amount: 6480 }),
      whatsapp: null,
      vatRate: 0.15,
    });
    expect(r.skip).toBe(true);
    expect(r.kind).toBeNull();
    expect(r.total).toBe(0);
  });

  it("annual club in its renewal month bills the annual subscription", () => {
    const r = buildConsolidatedInvoice({
      subscription: sub({ billingCycle: "annual", amount: 6480, periodEnd: "2027-09-01" }),
      whatsapp: null,
      vatRate: 0.15,
    });
    expect(r.kind).toBe("subscription");
    expect(r.subtotal).toBe(6480);
    expect(r.total).toBe(7452);
  });

  it("zero WhatsApp usage never adds a line", () => {
    const r = buildConsolidatedInvoice({
      subscription: sub(),
      whatsapp: { messageCount: 0, amount: 0, periodStart: "2026-08-01", periodEnd: "2026-08-31" },
      vatRate: 0,
    });
    expect(r.lineItems).toHaveLength(1);
    expect(r.whatsappAmount).toBe(0);
  });

  it("works with VAT disabled", () => {
    const r = buildConsolidatedInvoice({ subscription: sub(), whatsapp: wa(2, 0.9) });
    expect(r.vatAmount).toBe(0);
    expect(r.total).toBe(600.9);
  });

  it("is deterministic — rebuilding the same inputs yields identical totals (rerun safety)", () => {
    const args = { subscription: sub(), whatsapp: wa(40, 18), vatRate: 0.15 };
    expect(buildConsolidatedInvoice(args)).toEqual(buildConsolidatedInvoice(args));
  });

  it("prices the WhatsApp line at the blended per-message rate", () => {
    const r = buildConsolidatedInvoice({ subscription: sub({ due: false }), whatsapp: wa(4, 1.8) });
    expect(r.lineItems[0].unit_price).toBe(0.45);
    expect(r.lineItems[0].quantity).toBe(4);
  });
});


describe("advance issuing window", () => {
  it("lands on the 1st when run 5 days before a 31-day month end", () => {
    const target = addDays(new Date("2026-08-27T02:00:00Z"), 5);
    expect(target.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(isFirstOfMonth(target)).toBe(true);
  });

  it("lands on the 1st when run 5 days before a 30-day month end", () => {
    const target = addDays(new Date("2026-09-26T02:00:00Z"), 5);
    expect(target.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(isFirstOfMonth(target)).toBe(true);
  });

  it("does not fire on other days", () => {
    expect(isFirstOfMonth(addDays(new Date("2026-08-20T02:00:00Z"), 5))).toBe(false);
    expect(isFirstOfMonth(addDays(new Date("2026-08-28T02:00:00Z"), 5))).toBe(false);
  });

  it("dates the invoice on the renewal month start", () => {
    const billingDate = addDays(new Date("2026-08-27T02:00:00Z"), 5);
    expect(monthStartIso(billingDate)).toBe("2026-09-01");
    expect(previousMonthRange(billingDate)).toEqual({ start: "2026-08-01", end: "2026-08-31" });
    expect(isSubscriptionDue("2026-09-01", billingDate.toISOString().slice(0, 10))).toBe(true);
  });
});
