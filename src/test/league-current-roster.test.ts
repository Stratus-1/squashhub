import { describe, it, expect } from "vitest";
import { shouldUseCurrentDefault, sideIsExplicit } from "@/lib/league/lineup";

const s = (name: string, code = "") => ({ name, code });
const base = { rowLocked: false, matchStarted: false };

describe("current roster vs match lineup", () => {
  it("upcoming match: default-copy row refreshes to current roster", () => {
    expect(shouldUseCurrentDefault({ ...base, saved: s("Old A & Old B"), local: s("Old A & Old B"), current: s("New A & New B"), explicit: false })).toBe(true);
  });
  it("legacy row with superseded pair refreshes; removed player no longer shown", () => {
    const stale = new Set(["OLD A & OLD B"]);
    expect(shouldUseCurrentDefault({ ...base, saved: s("Old A & Old B"), local: s("Old A & Old B"), current: s("New A & New B"), explicit: null, staleDefaults: stale })).toBe(true);
  });
  it("legacy unknown row (possible reserve) is kept", () => {
    expect(shouldUseCurrentDefault({ ...base, saved: s("Reserve R"), local: s("Reserve R"), current: s("New A"), explicit: null, staleDefaults: new Set() })).toBe(false);
  });
  it("explicit match lineup persists over roster changes", () => {
    expect(shouldUseCurrentDefault({ ...base, saved: s("Reserve R"), local: s("Reserve R"), current: s("New A"), explicit: true })).toBe(false);
  });
  it("started or locked match keeps historical participants", () => {
    expect(shouldUseCurrentDefault({ ...base, matchStarted: true, saved: s("Old"), local: s("Old"), current: s("New"), explicit: false })).toBe(false);
    expect(shouldUseCurrentDefault({ ...base, rowLocked: true, saved: s("Old"), local: s("Old"), current: s("New"), explicit: false })).toBe(false);
  });
  it("unsaved local edit is not overwritten", () => {
    expect(shouldUseCurrentDefault({ ...base, saved: s("Old"), local: s("Picked"), current: s("New"), explicit: false })).toBe(false);
  });
  it("explicit flag derives from difference with current default", () => {
    expect(sideIsExplicit(s("New A", "X1"), s("New A", "X1"))).toBe(false);
    expect(sideIsExplicit(s("Reserve", "R9"), s("New A", "X1"))).toBe(true);
    expect(sideIsExplicit(s(""), s("New A"))).toBe(false);
  });
});
