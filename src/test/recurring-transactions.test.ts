import { describe, it, expect } from "vitest";
import { nextDueDate } from "@/lib/finance/recurring";

describe("recurring transaction next due", () => {
  it("weekly adds 7 days", () => expect(nextDueDate("2026-10-18", "weekly")).toBe("2026-10-25"));
  it("monthly adds a month", () => expect(nextDueDate("2026-10-18", "monthly")).toBe("2026-11-18"));
  it("monthly clamps month end", () => expect(nextDueDate("2026-01-31", "monthly")).toBe("2026-02-28"));
  it("quarterly adds 3 months", () => expect(nextDueDate("2026-11-30", "quarterly")).toBe("2027-02-28"));
  it("yearly adds a year", () => expect(nextDueDate("2026-10-18", "yearly")).toBe("2027-10-18"));
});
