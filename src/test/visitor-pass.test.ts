import { describe, it, expect } from "vitest";
import {
  computeValidUntil,
  isPassLive,
  isFreePass,
  isPassOffered,
  visitorPassStatusLabel,
  visitorBookingDecision,
} from "@/lib/visitor-pass";

const at = (iso: string) => new Date(iso);

describe("visitor pass validity", () => {
  it("day pass runs 24 hours from activation", () => {
    expect(computeValidUntil("day", at("2026-09-21T10:00:00Z")).toISOString()).toBe("2026-09-22T10:00:00.000Z");
  });
  it("3-day pass runs 72 hours", () => {
    expect(computeValidUntil("three_day", at("2026-09-21T10:00:00Z")).toISOString()).toBe("2026-09-24T10:00:00.000Z");
  });
  it("monthly pass runs one calendar month", () => {
    expect(computeValidUntil("month", at("2026-01-31T10:00:00Z")).getMonth()).toBe(2); // Jan 31 -> Mar 3
  });
});

describe("pass configuration", () => {
  it("an unconfigured pass is not offered even at zero", () => {
    expect(isPassOffered({ active: false })).toBe(false);
    expect(isFreePass({ active: false, amount: 0 })).toBe(false);
  });
  it("zero on a switched-on pass is a deliberate free pass", () => {
    expect(isFreePass({ active: true, amount: 0 })).toBe(true);
  });
});

describe("entitlement", () => {
  const now = at("2026-09-21T12:00:00Z");
  const live = { status: "active" as const, valid_from: "2026-09-21T09:00:00Z", valid_until: "2026-09-22T09:00:00Z" };
  const lapsed = { status: "active" as const, valid_from: "2026-09-19T09:00:00Z", valid_until: "2026-09-20T09:00:00Z" };

  it("a live pass allows booking", () => {
    expect(isPassLive(live, now)).toBe(true);
    expect(visitorBookingDecision({ isVisitor: true, visitorsCanBook: true, pass: live, now }).allowed).toBe(true);
  });
  it("a lapsed pass reads as expired and blocks booking", () => {
    expect(isPassLive(lapsed, now)).toBe(false);
    expect(visitorPassStatusLabel(lapsed, now)).toBe("Expired");
    expect(visitorBookingDecision({ isVisitor: true, visitorsCanBook: true, pass: lapsed, now }).allowed).toBe(false);
  });
  it("an unpaid pass blocks booking with a payment message", () => {
    const d = visitorBookingDecision({
      isVisitor: true,
      visitorsCanBook: true,
      pass: { status: "pending_payment", valid_from: null, valid_until: null },
      now,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/not paid/i);
  });
  it("a pass awaiting approval blocks booking", () => {
    const d = visitorBookingDecision({
      isVisitor: true,
      visitorsCanBook: true,
      pass: { status: "pending_approval", valid_from: null, valid_until: null },
      now,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/approve/i);
  });
  it("a renewal after expiry works on the same visitor record", () => {
    const renewed = { status: "active" as const, valid_from: "2026-09-21T11:00:00Z", valid_until: "2026-09-22T11:00:00Z" };
    expect(visitorBookingDecision({ isVisitor: true, visitorsCanBook: true, pass: renewed, now }).allowed).toBe(true);
  });
  it("full members are never gated by a visitor pass", () => {
    expect(visitorBookingDecision({ isVisitor: false, visitorsCanBook: false, pass: null, now }).allowed).toBe(true);
  });
  it("visitor bookings switched off at the club always block", () => {
    expect(visitorBookingDecision({ isVisitor: true, visitorsCanBook: false, pass: live, now }).allowed).toBe(false);
  });
});
