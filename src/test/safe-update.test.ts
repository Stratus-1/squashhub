import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  beginActivity,
  isBusy,
  subscribeActivity,
  __resetActivity,
} from "@/lib/app-activity";
import { hashToBucket, isInRolloutCohort, type ReleaseInfo } from "@/lib/release-policy";

const rel = (o: Partial<ReleaseInfo> = {}): ReleaseInfo => ({
  build_id: "abc123",
  severity: "normal",
  rollout_percent: 100,
  target_club_ids: [],
  ...o,
});

describe("app-activity", () => {
  beforeEach(() => __resetActivity());
  afterEach(() => __resetActivity());

  it("is idle by default", () => {
    expect(isBusy()).toBe(false);
  });

  it("tracks nested activities and only clears when all end", () => {
    const a = beginActivity("scoring");
    const b = beginActivity("form");
    expect(isBusy()).toBe(true);
    a();
    expect(isBusy()).toBe(true);
    b();
    expect(isBusy()).toBe(false);
  });

  it("end() is idempotent", () => {
    const a = beginActivity("form");
    a();
    a();
    expect(isBusy()).toBe(false);
  });

  it("notifies subscribers on busy -> idle transitions", () => {
    const seen: boolean[] = [];
    const off = subscribeActivity((b) => seen.push(b));
    const end = beginActivity("upload");
    end();
    off();
    expect(seen).toEqual([true, false]);
  });
});

describe("rollout cohort", () => {
  it("hashes deterministically into 0-99", () => {
    const a = hashToBucket("build:device");
    expect(a).toBe(hashToBucket("build:device"));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
  });

  it("includes everyone at 100%", () => {
    expect(isInRolloutCohort(rel(), "device-1")).toBe(true);
  });

  it("excludes everyone at 0%", () => {
    expect(isInRolloutCohort(rel({ rollout_percent: 0 }), "device-1")).toBe(false);
  });

  it("treats missing metadata as full rollout", () => {
    expect(isInRolloutCohort(null, "device-1")).toBe(true);
  });

  it("always includes critical releases", () => {
    expect(
      isInRolloutCohort(rel({ severity: "critical", rollout_percent: 0 }), "d"),
    ).toBe(true);
  });

  it("honours club targeting", () => {
    const r = rel({ target_club_ids: ["club-a"] });
    expect(isInRolloutCohort(r, "d", "club-a")).toBe(true);
    expect(isInRolloutCohort(r, "d", "club-b")).toBe(false);
    expect(isInRolloutCohort(r, "d", null)).toBe(false);
  });

  it("splits devices roughly by percentage", () => {
    const inCohort = Array.from({ length: 1000 }, (_, i) =>
      isInRolloutCohort(rel({ rollout_percent: 30 }), `device-${i}`),
    ).filter(Boolean).length;
    expect(inCohort).toBeGreaterThan(200);
    expect(inCohort).toBeLessThan(400);
  });

  it("is stable for the same device and build", () => {
    const r = rel({ rollout_percent: 50 });
    const first = isInRolloutCohort(r, "device-x");
    for (let i = 0; i < 5; i++) expect(isInRolloutCohort(r, "device-x")).toBe(first);
  });
});
