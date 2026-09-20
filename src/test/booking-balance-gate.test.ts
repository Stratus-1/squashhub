import { describe, it, expect } from "vitest";
import { computeBookingGate } from "@/lib/booking-balance-gate";

const BUFFER = 20; // Gordon's Bay floating booking balance

describe("computeBookingGate", () => {
  it("recognises 'club' membership fees as carryable (Gordon's Bay fee type)", () => {
    const r = computeBookingGate({
      currentOwing: 1600,
      fees: [{ amount: 1600, fee_type: "club" }],
      hasMandate: false,
      buffer: BUFFER,
    });
    expect(r.planAllowedDebt).toBe(1600);
    // Owes exactly the membership fee → only the R20 buffer is missing
    expect(r.shortfall).toBe(20);
  });

  it("ignores non-membership fees when there is no arrangement", () => {
    const r = computeBookingGate({
      currentOwing: 1900,
      fees: [
        { amount: 1600, fee_type: "club" },
        { amount: 300, fee_type: "lights" },
      ],
      hasMandate: false,
      buffer: BUFFER,
    });
    expect(r.planAllowedDebt).toBe(1600);
    expect(r.shortfall).toBe(320);
  });

  it("with a monthly arrangement the requirement moves by exactly what was paid", () => {
    // Nothing paid yet: owes R1 600 → needs −1 580, i.e. R20 short from 0
    const before = computeBookingGate({
      currentOwing: 1600,
      fees: [{ amount: 1600, fee_type: "club" }],
      hasMandate: true,
      buffer: BUFFER,
    });
    expect(before.shortfall).toBe(20);

    // Pays R100: owing drops to R1 500 AND the fee shrinks to R1 500 → still R20 short,
    // but now a further R20 actually clears it (no grandfathered bump-up).
    const after = computeBookingGate({
      currentOwing: 1500,
      fees: [{ amount: 1500, fee_type: "club" }],
      hasMandate: true,
      buffer: BUFFER,
    });
    expect(after.shortfall).toBe(20);

    // Pays the R20 buffer on top: credit of 20 → owing 1 480 → allowed
    const cleared = computeBookingGate({
      currentOwing: 1480,
      fees: [{ amount: 1500, fee_type: "club" }],
      hasMandate: true,
      buffer: BUFFER,
    });
    expect(cleared.shortfall).toBe(0);
  });

  it("no grandfathering: owing above the allowance is never re-allowed", () => {
    // Katya's bug: owing (1 635.33) > unpaid fees (1 600) used to bump the
    // allowance up to the full balance, leaving her exactly R20 short forever.
    const r = computeBookingGate({
      currentOwing: 1635.33,
      fees: [{ amount: 1600, fee_type: "club" }],
      hasMandate: true,
      buffer: BUFFER,
    });
    expect(r.planAllowedDebt).toBe(1600);
    expect(r.shortfall).toBeCloseTo(55.33, 2); // 35.33 lights + 20 buffer
  });

  it("family fees: season total minus payments made is carryable", () => {
    // R1 600 package + R120 son = R1 720; two payments of R133.33 made →
    // fee rows now total R1 453.34; owing is fees + R35.33 lights.
    const r = computeBookingGate({
      currentOwing: 1635.33 + 120, // her journal + son's fee raised on his account
      fees: [
        { amount: 1333.34, fee_type: "club" }, // her fee after 2 instalments
        { amount: 120, fee_type: "club" }, // son's family fee, payer = her
      ],
      hasMandate: true,
      buffer: BUFFER,
    });
    expect(r.planAllowedDebt).toBeCloseTo(1453.34, 2);
    expect(r.shortfall).toBeCloseTo(321.99, 2); // 301.99 lights + 20 buffer
  });
});
