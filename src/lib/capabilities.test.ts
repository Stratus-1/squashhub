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
  isTabVisible,
  moduleState,
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
    // Ranking points genuinely need the ladder (positions are the input)
    expect([...withDependencies("ranking_points")].sort()).toEqual(["ladder", "ranking_points"]);
    // Court lights are configured per court, so they need bookings
    expect(withDependencies("lights").has("bookings")).toBe(true);
    // Soft relationships must NOT force other modules on
    expect(withDependencies("bar").has("finance")).toBe(false);
    expect(withDependencies("membership_fees").has("finance")).toBe(false);
    expect(withDependencies("leagues").has("bookings")).toBe(false);
  });

  it("is idempotent for a capability with no requirements", () => {
    expect([...withDependencies("visitors")]).toEqual(["visitors"]);
  });
});

describe("dependentsOf (safe disable)", () => {
  it("reports enabled capabilities that would break", () => {
    const enabled = new Set<string>(["bookings", "lights", "ladder", "ranking_points"]);
    expect(dependentsOf("bookings", enabled).sort()).toEqual(["lights"]);
    expect(dependentsOf("ladder", enabled).sort()).toEqual(["ranking_points"]);
  });

  it("ignores capabilities that are already off", () => {
    const enabled = new Set<string>(["bookings"]);
    expect(dependentsOf("bookings", enabled)).toEqual([]);
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

describe("isTabVisible (UI gating)", () => {
  const enabled = new Set<string>(["bookings", "ladder"]);

  it("always shows core tabs", () => {
    expect(isTabVisible({}, new Set())).toBe(true);
  });

  it("shows optional tabs only when enabled", () => {
    expect(isTabVisible({ capability: "bookings" }, enabled)).toBe(true);
    expect(isTabVisible({ capability: "bar" }, enabled)).toBe(false);
  });

  it("fails open for tenants with no capability rows", () => {
    expect(isTabVisible({ capability: "bar" }, new Set(), false)).toBe(true);
  });
});

describe("moduleState (Off / needs setup / ready)", () => {
  it("reports off for a disabled capability regardless of configuration", () => {
    expect(moduleState("bookings", new Set(), { courts: "complete" })).toBe("off");
  });

  it("reports needs_setup when enabled but unconfigured", () => {
    expect(moduleState("bookings", new Set(["bookings"]), { courts: "incomplete" })).toBe(
      "needs_setup"
    );
  });

  it("reports ready when enabled and configured", () => {
    expect(moduleState("bookings", new Set(["bookings"]), { courts: "complete" })).toBe("ready");
  });

  it("treats capabilities with no setup step as ready once on", () => {
    expect(moduleState("events", new Set(["events"]))).toBe("ready");
  });
});
