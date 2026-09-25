import { describe, it, expect } from "vitest";
import {
  INITIAL_AUTO_UNLOCK_STATE,
  EXIT_CONFIRM_MS,
  FIRED_EXPIRY_MS,
  stepAutoUnlock,
  clampUnlockSeconds,
  type AutoUnlockState,
} from "@/lib/geofence-auto-unlock";

const R = 50;
function run(samples: [number, number, number][], start: AutoUnlockState = INITIAL_AUTO_UNLOCK_STATE) {
  let s = start;
  let fires = 0;
  for (const [d, acc, t] of samples) {
    const r = stepAutoUnlock(s, { distanceM: d, accuracyM: acc, now: t }, R);
    s = r.state;
    if (r.fire) fires++;
  }
  return { s, fires };
}

describe("geofence auto-unlock", () => {
  it("fires once on entry and not again while inside", () => {
    const { fires } = run([
      [300, 10, 0], [120, 10, 5000], [40, 10, 10000], [20, 10, 15000], [5, 10, 20000], [30, 10, 60000],
    ]);
    expect(fires).toBe(1);
  });

  it("ignores boundary jitter without a confirmed exit", () => {
    const { fires } = run([
      [40, 10, 0], [85, 10, 5000], [45, 10, 10000], [90, 10, 20000], [48, 10, 30000],
    ]);
    expect(fires).toBe(1);
  });

  it("re-arms only after a sustained genuine exit, then fires on re-entry", () => {
    const { fires } = run([
      [30, 10, 0],
      [200, 10, 10_000],
      [200, 10, 10_000 + EXIT_CONFIRM_MS],
      [30, 10, 10_000 + EXIT_CONFIRM_MS + 60_000],
    ]);
    expect(fires).toBe(2);
  });

  it("does not trigger on an inaccurate fix", () => {
    expect(run([[10, 500, 0]]).fires).toBe(0);
  });

  it("treats a very old fired record as a new visit", () => {
    const { fires } = run([[20, 10, FIRED_EXPIRY_MS + 1]], { fired: true, firedAt: 0, outsideSince: null });
    expect(fires).toBe(1);
  });

  it("clamps unlock seconds", () => {
    expect(clampUnlockSeconds("0", 3)).toBe(1);
    expect(clampUnlockSeconds("500", 3)).toBe(120);
    expect(clampUnlockSeconds("abc", 12)).toBe(12);
  });
});
