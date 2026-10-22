import { describe, expect, it } from "vitest";
import { cashUpDateLabel } from "@/components/bar/CashUp";

describe("cash-up accounting date", () => {
  it("labels the combined evening 21 October without deriving it from the morning cutoff", () => {
    expect(cashUpDateLabel("2026-10-21")).toBe("21 Oct 2026");
  });
  it("does not invent a label for existing cash-ups or invalid dates", () => {
    expect(cashUpDateLabel(undefined)).toBeNull();
    expect(cashUpDateLabel("2026-02-30")).toBeNull();
  });
});