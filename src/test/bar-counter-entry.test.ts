import { describe, expect, it } from "vitest";
import { canShowCounterEntry } from "@/lib/bar/counter-entry";

describe("Counter shortcut account or PIN requirement", () => {
  it("allows a confirmed club account", () => {
    expect(canShowCounterEntry(true, null, null)).toBe(true);
  });
  it("allows a named personal-PIN session without an account", () => {
    expect(canShowCounterEntry(false, "session", "Barman")).toBe(true);
  });
  it.each([[null, null], ["session", null], [null, "Barman"], ["session", " "]])("hides it without an account or complete PIN session (%s, %s)", (token, operator) => {
    expect(canShowCounterEntry(false, token, operator)).toBe(false);
  });
});