import { describe, it, expect } from "vitest";
import { visitorFeeCheckApplies } from "@/lib/visitor-fee-prepay";

const base = { isVisitorRole: false, playerMode: "visitor", guestName: "Jan", opponentId: null, prepayRequired: true, visitorFee: 50 };

describe("visitor fee payable immediately", () => {
  it("applies when a member names a visitor and the club switch is on", () => {
    expect(visitorFeeCheckApplies(base)).toBe(true);
  });
  it("does not apply when the club switch is off (the default)", () => {
    expect(visitorFeeCheckApplies({ ...base, prepayRequired: false })).toBe(false);
  });
  it("does not apply when the booking names a member opponent", () => {
    expect(visitorFeeCheckApplies({ ...base, playerMode: "member", opponentId: "m1" })).toBe(false);
  });
  it("does not apply when the club charges no visitor fee", () => {
    expect(visitorFeeCheckApplies({ ...base, visitorFee: 0 })).toBe(false);
  });
});
