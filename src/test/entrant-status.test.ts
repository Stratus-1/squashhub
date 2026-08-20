import { describe, expect, it } from "vitest";
import {
  classifyEntrant,
  countEntrantsByCategory,
  entrantStatusLabel,
  filterParticipatingEntrants,
  hasAccepted,
  isParticipatingEntrant,
  partitionByDivisionAssignment,
} from "@/lib/tournaments/entrant-status";

const free = { paymentRequired: false };
const paid = { paymentRequired: true };

describe("classifyEntrant", () => {
  it("treats a pending invitation as not participating", () => {
    const r = { status: "invited" };
    expect(classifyEntrant(r, free)).toBe("pending_invite");
    expect(isParticipatingEntrant(r, free)).toBe(false);
  });

  it("treats acceptance of a free tournament as registered (Willem / Riverside path)", () => {
    const r = { status: "paid", confirmed_at: "2026-08-20T21:24:00Z", confirmation_source: "invite_link" };
    expect(classifyEntrant(r, free)).toBe("registered");
    expect(isParticipatingEntrant(r, free)).toBe(true);
  });

  it("keeps an acceptance with an outstanding fee out of the draw", () => {
    const r = { status: "pending_payment", confirmed_at: "2026-08-20T21:24:00Z" };
    expect(classifyEntrant(r, paid)).toBe("accepted");
    expect(isParticipatingEntrant(r, paid)).toBe(false);
  });

  it("counts the same acceptance as registered when payment is not mandatory", () => {
    const r = { status: "pending_payment", confirmed_at: "2026-08-20T21:24:00Z" };
    expect(classifyEntrant(r, free)).toBe("registered");
  });

  it("classifies payment started without acceptance as payment_pending", () => {
    expect(classifyEntrant({ status: "pending_eft" }, paid)).toBe("payment_pending");
  });

  it("classifies waived and part-paid rows as registered", () => {
    expect(classifyEntrant({ status: "waived" }, paid)).toBe("registered");
    expect(classifyEntrant({ status: "pending_payment", fee_paid_cents: 5000 }, paid)).toBe("registered");
  });

  it("classifies cancelled as declined regardless of payment", () => {
    expect(classifyEntrant({ status: "cancelled", fee_paid_cents: 5000 }, paid)).toBe("declined");
    expect(hasAccepted({ status: "cancelled", confirmed_at: "x" })).toBe(false);
  });

  it("is case/whitespace tolerant", () => {
    expect(classifyEntrant({ status: " PAID " }, paid)).toBe("registered");
  });
});

describe("labels", () => {
  it("labels each category for organisers", () => {
    expect(entrantStatusLabel({ status: "invited" }, paid)).toBe("Invited — no response");
    expect(entrantStatusLabel({ status: "pending_payment", confirmed_at: "x" }, paid)).toBe("Accepted — fee due");
    expect(entrantStatusLabel({ status: "paid" }, paid)).toBe("Registered");
    expect(entrantStatusLabel({ status: "cancelled" }, paid)).toBe("Declined");
  });
});

describe("filtering and counts", () => {
  const rows = [
    { club_member_id: "a", status: "paid" },
    { club_member_id: "b", status: "invited" },
    { club_member_id: "c", status: "pending_payment", confirmed_at: "x" },
    { club_member_id: "d", status: "cancelled" },
    { club_member_id: "e", status: "waived" },
  ];

  it("only exposes registered entrants to the Players list (fee tournament)", () => {
    expect(filterParticipatingEntrants(rows, paid).map((r) => r.club_member_id)).toEqual(["a", "e"]);
  });

  it("includes fee-due acceptances when the tournament is free / payment optional", () => {
    expect(filterParticipatingEntrants(rows, free).map((r) => r.club_member_id)).toEqual(["a", "c", "e"]);
  });

  it("never counts pending invitees in the draw size", () => {
    const counts = countEntrantsByCategory(rows, paid);
    expect(counts).toEqual({ pending_invite: 1, accepted: 1, payment_pending: 0, registered: 2, declined: 1 });
  });

  it("handles null input", () => {
    expect(filterParticipatingEntrants(null, paid)).toEqual([]);
  });
});

describe("partitionByDivisionAssignment", () => {
  const leagues = new Map<string, string[]>([
    ["a", ["league-1"]],
    ["e", []],
  ]);
  const rows = [
    { club_member_id: "a", status: "paid" },
    { club_member_id: "e", status: "paid" },
    { club_member_id: "z", status: "paid" },
    { club_member_id: "b", status: "invited" },
  ];

  it("buckets accepted members with no league as needing division assignment", () => {
    const { assigned, needsDivision } = partitionByDivisionAssignment(rows, leagues, paid);
    expect(assigned.map((r) => r.club_member_id)).toEqual(["a"]);
    expect(needsDivision.map((r) => r.club_member_id)).toEqual(["e", "z"]);
  });

  it("excludes non-participating entrants from both buckets", () => {
    const { assigned, needsDivision } = partitionByDivisionAssignment(rows, leagues, paid);
    expect([...assigned, ...needsDivision].some((r) => r.club_member_id === "b")).toBe(false);
  });
});
