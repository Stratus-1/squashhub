import { describe, it, expect } from "vitest";
import { computeBookingGate } from "@/lib/booking-balance-gate";

const BUFFER = 20; // club booking float

describe("computeBookingGate", () => {
  it("no arrangement: the whole balance plus the float must be settled", () => {
    const r = computeBookingGate({
      currentOwing: 1600,
      fees: [{ amount: 1600, fee_type: "club" }],
      hasMandate: false,
      buffer: BUFFER,
    });
    expect(r.planAllowedDebt).toBe(0);
    expect(r.shortfall).toBe(1620);
  });

  it("with an arrangement, fees under it never block a booking", () => {
    const r = computeBookingGate({
      currentOwing: 1600,
      fees: [{ amount: 1600, fee_type: "club" }],
      hasMandate: true,
      buffer: BUFFER,
    });
    expect(r.planAllowedDebt).toBe(1600);
    expect(r.shortfall).toBe(20);
  });

  it("only non-fee charges (lights, bar) plus the float are required", () => {
    const r = computeBookingGate({
      currentOwing: 1635.33, // 1333.34 fees + 301.99 court lights
      fees: [{ amount: 1333.34, fee_type: "club" }],
      hasMandate: true,
      buffer: BUFFER,
    });
    expect(r.shortfall).toBeCloseTo(321.99, 2);
  });

  it("a payment moves the requirement rand for rand", () => {
    const after = computeBookingGate({
      currentOwing: 1385.33, // paid R250
      fees: [{ amount: 1333.34, fee_type: "club" }],
      hasMandate: true,
      buffer: BUFFER,
    });
    expect(after.shortfall).toBeCloseTo(71.99, 2);
  });

  it("family fees carried by the payer count under the arrangement", () => {
    const r = computeBookingGate({
      currentOwing: 1453.34,
      fees: [
        { amount: 1333.34, fee_type: "club" },
        { amount: 120, fee_type: "club" },
      ],
      hasMandate: true,
      buffer: BUFFER,
    });
    expect(r.planAllowedDebt).toBeCloseTo(1453.34, 2);
    expect(r.shortfall).toBe(20);
  });
});
