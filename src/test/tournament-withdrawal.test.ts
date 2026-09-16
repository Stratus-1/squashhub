import { describe, it, expect } from "vitest";
import { withdrawalInfo } from "@/lib/tournaments/invite-link";

const now = new Date("2026-09-20T10:00:00Z");

describe("pulling out of a tournament", () => {
  it("is open while the cut-off has not passed", () => {
    const info = withdrawalInfo(
      { found: true, withdrawals_allowed: true, withdrawal_deadline: "2026-09-27T00:00:00Z" },
      now,
    );
    expect(info.open).toBe(true);
    expect(info.closedReason).toBeNull();
  });

  it("closes once the cut-off date has passed", () => {
    const info = withdrawalInfo(
      { found: true, withdrawals_allowed: true, withdrawal_deadline: "2026-09-18T00:00:00Z" },
      now,
    );
    expect(info.open).toBe(false);
    expect(info.closedReason).toMatch(/closed/i);
  });

  it("is never offered when the organiser switched it off", () => {
    const info = withdrawalInfo(
      { found: true, withdrawals_allowed: false, withdrawal_deadline: "2026-09-27T00:00:00Z" },
      now,
    );
    expect(info.open).toBe(false);
  });

  it("stays open when the tournament has no start date yet", () => {
    expect(withdrawalInfo({ found: true, withdrawals_allowed: true }, now).open).toBe(true);
  });
});
