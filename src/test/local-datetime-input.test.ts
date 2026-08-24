import { describe, expect, it } from "vitest";
import { fromLocalInputValue, localInputRoundTripsCleanly, toLocalInputValue } from "@/lib/datetime/local-input";

describe("datetime-local round trip", () => {
  it("does not drift when a form is opened and saved repeatedly", () => {
    let iso: string | null = "2026-08-23T21:00:00.000Z";
    for (let i = 0; i < 10; i++) {
      iso = fromLocalInputValue(toLocalInputValue(iso));
    }
    expect(iso).toBe("2026-08-23T21:00:00.000Z");
  });

  it("shows the stored instant as local wall clock", () => {
    const value = toLocalInputValue("2026-08-17T07:00:00.000Z");
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromLocalInputValue(value)).toBe("2026-08-17T07:00:00.000Z");
  });

  it("handles empty and invalid input", () => {
    expect(toLocalInputValue(null)).toBe("");
    expect(toLocalInputValue("not a date")).toBe("");
    expect(fromLocalInputValue("")).toBeNull();
    expect(fromLocalInputValue("nope")).toBeNull();
  });

  it("reports a clean round trip", () => {
    expect(localInputRoundTripsCleanly("2026-08-23T21:00:00.000Z")).toBe(true);
    expect(localInputRoundTripsCleanly(null)).toBe(true);
  });
});
