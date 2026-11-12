import { describe, it, expect } from "vitest";
import { isExpiredCardTopup } from "../../supabase/functions/_shared/lights-topup-expiry";

const now = new Date("2026-11-12T08:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

describe("card Lights top-up 24-hour expiry", () => {
  it("expires an unpaid card top-up older than 24 hours", () => {
    expect(isExpiredCardTopup({ method: "card", status: "awaiting_payment", created_at: hoursAgo(25) }, now)).toBe(true);
  });
  it("keeps an unpaid card top-up younger than 24 hours", () => {
    expect(isExpiredCardTopup({ method: "card", status: "awaiting_payment", created_at: hoursAgo(23) }, now)).toBe(false);
  });
  it("never expires EFT top-ups", () => {
    expect(isExpiredCardTopup({ method: "eft", status: "awaiting_payment", created_at: hoursAgo(72) }, now)).toBe(false);
  });
  it("never touches card top-ups that were paid", () => {
    expect(isExpiredCardTopup({ method: "card", status: "posted", created_at: hoursAgo(72) }, now)).toBe(false);
  });
});
