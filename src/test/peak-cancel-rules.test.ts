import { describe, it, expect } from "vitest";
import { decideCancel, inLateWindow, bookingHoursSummary } from "@/lib/peak-cancel-rules";

const base = { restrictEnabled: true, penaltiesEnabled: true, squashhubLighting: true, lateCancelAllowed: false,
  lateCancelFee: 50, slotMinutes: 45, isPeak: true, isAdmin: false, minutesToStart: 30, createdAfterEnabled: true };

describe("peak cancel rules", () => {
  it("late window equals one configured slot", () => {
    expect(inLateWindow(45, 45)).toBe(true);
    expect(inLateWindow(46, 45)).toBe(false);
    expect(inLateWindow(60, 60)).toBe(true);
    expect(inLateWindow(61, 60)).toBe(false);
    expect(inLateWindow(90, 90)).toBe(true);
  });
  it("everything off by default allows cancel with no fee", () => {
    expect(decideCancel({ ...base, restrictEnabled: false })).toEqual({ action: "allow", fee: 0 });
  });
  it("non-peak and outside window unaffected", () => {
    expect(decideCancel({ ...base, isPeak: false }).action).toBe("allow");
    expect(decideCancel({ ...base, minutesToStart: 120 }).action).toBe("allow");
  });
  it("toggle off blocks members, toggle on charges once", () => {
    expect(decideCancel(base).action).toBe("block");
    expect(decideCancel({ ...base, lateCancelAllowed: true })).toEqual({ action: "allow_with_fee", fee: 50 });
  });
  it("admins cancel with waiver, no fee", () => {
    expect(decideCancel({ ...base, isAdmin: true })).toEqual({ action: "allow_admin_waiver", fee: 0 });
  });
  it("no penalties for non-SquashHub-lighting clubs or old bookings", () => {
    expect(decideCancel({ ...base, lateCancelAllowed: true, squashhubLighting: false }).action).toBe("block");
    expect(decideCancel({ ...base, lateCancelAllowed: true, createdAfterEnabled: false }).action).toBe("block");
  });
  it("started bookings cannot be cancelled by members", () => {
    expect(decideCancel({ ...base, lateCancelAllowed: true, minutesToStart: -5 }).action).toBe("block");
  });
  it("booking hours summary for Uitsig", () => {
    expect(bookingHoursSummary(45, "05:15", "21:45")).toEqual({ first: "05:15", last: "21:45", close: "22:30", step: 45 });
  });
});
