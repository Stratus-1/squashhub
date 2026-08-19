import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  CAPABILITY_META,
  CAPABILITY_LIST,
  CORE_TABS,
  DEFAULT_CAPABILITIES,
  TAB_CAPABILITY,
  dependentsOf,
  withDependencies,
  type Capability,
} from "./capabilities";

describe("capability registry", () => {
  it("every capability declares valid dependencies", () => {
    for (const meta of CAPABILITY_LIST) {
      for (const dep of meta.requires) {
        expect(CAPABILITIES).toContain(dep);
      }
      for (const dep of meta.worksWith ?? []) {
        expect(CAPABILITIES).toContain(dep);
      }
      expect(meta.requires).not.toContain(meta.slug);
    }
  });

  it("dependency graph has no cycles", () => {
    for (const slug of CAPABILITIES) {
      expect(() => withDependencies(slug)).not.toThrow();
    }
  });

  it("no capability tab collides with a core tab", () => {
    for (const tab of Object.keys(TAB_CAPABILITY)) {
      expect(CORE_TABS).not.toContain(tab as (typeof CORE_TABS)[number]);
    }
  });
});

describe("withDependencies", () => {
  it("pulls in transitive requirements when enabling", () => {
    // Bar requires Club Books
    expect([...withDependencies("bar")].sort()).toEqual(["bar", "finance"]);
    // Membership fees requires Club Books
    expect(withDependencies("membership_fees").has("finance")).toBe(true);
    // Ranking points requires the ladder
    expect(withDependencies("ranking_points").has("ladder")).toBe(true);
    // Leagues require courts/bookings
    expect(withDependencies("leagues").has("bookings")).toBe(true);
  });

  it("is idempotent for a capability with no requirements", () => {
    expect([...withDependencies("visitors")]).toEqual(["visitors"]);
  });
});

describe("dependentsOf (safe disable)", () => {
  it("reports enabled capabilities that would break", () => {
    const enabled = new Set<string>(["finance", "bar", "membership_fees", "payments"]);
    expect(dependentsOf("finance", enabled).sort()).toEqual([
      "bar",
      "membership_fees",
      "payments",
    ]);
  });

  it("ignores capabilities that are already off", () => {
    const enabled = new Set<string>(["finance"]);
    expect(dependentsOf("finance", enabled)).toEqual([]);
  });

  it("follows transitive chains", () => {
    const enabled = new Set<string>(["ladder", "ranking_points"]);
    expect(dependentsOf("ladder", enabled)).toEqual(["ranking_points"]);
  });

  it("never lists the capability itself", () => {
    const enabled = new Set<string>(CAPABILITIES);
    for (const slug of CAPABILITIES) {
      expect(dependentsOf(slug, enabled)).not.toContain(slug);
    }
  });
});

describe("small-club defaults", () => {
  it("are lightweight and self-consistent", () => {
    const defaults = new Set<Capability>(DEFAULT_CAPABILITIES);
    expect(defaults.size).toBeLessThanOrEqual(5);
    for (const slug of defaults) {
      for (const dep of CAPABILITY_META[slug].requires) {
        expect(defaults.has(dep)).toBe(true);
      }
    }
    // Money modules stay off until a club asks for them
    expect(defaults.has("finance")).toBe(false);
    expect(defaults.has("bar")).toBe(false);
  });
});
