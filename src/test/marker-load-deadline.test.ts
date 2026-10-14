import { afterEach, describe, expect, it, vi } from "vitest";
import { startMarkerLoadDeadline } from "@/lib/marker/load-deadline";
afterEach(() => vi.useRealTimers());
describe("saved-score load deadline", () => {
  it("aborts pending reads and exits loading once after twenty seconds", () => {
    vi.useFakeTimers(); const timeout = vi.fn(); const load = startMarkerLoadDeadline(timeout);
    vi.advanceTimersByTime(19999); expect(timeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(timeout).toHaveBeenCalledTimes(1); expect(load.signal.aborted).toBe(true);
    vi.advanceTimersByTime(20000); expect(timeout).toHaveBeenCalledTimes(1);
  });
  it("successful load/unmount cancels the timer and a retry gets a fresh signal", () => {
    vi.useFakeTimers(); const timeout = vi.fn(); const first = startMarkerLoadDeadline(timeout); first.cancel();
    const retry = startMarkerLoadDeadline(timeout);
    expect(retry.signal.aborted).toBe(false); retry.cancel();
    vi.advanceTimersByTime(20000); expect(timeout).not.toHaveBeenCalled();
  });
  it("does not enable the pilot deadline for other clubs", () => {
    vi.useFakeTimers(); const timeout = vi.fn(); const load = startMarkerLoadDeadline(timeout, null);
    vi.advanceTimersByTime(60000); expect(timeout).not.toHaveBeenCalled(); expect(load.signal.aborted).toBe(false); load.cancel();
  });
});
import { readFileSync } from "node:fs";
describe("tournament Mark Game link never strands the spinner", () => {
  const src = readFileSync("src/pages/MatchMarker.tsx", "utf8");
  it("keeps the manual setup screen unmounted while a tournament link is pending", () => {
    const loading = src.indexOf('tournamentLoadState === "loading" || pendingTournamentLink');
    const setup = src.indexOf("<MarkerSetup");
    expect(loading).toBeGreaterThan(0);
    expect(setup).toBeGreaterThan(loading);
  });
  it("clears a cancelled load instead of spinning forever, and bounds every club's load", () => {
    expect(src).toContain('setTournamentLoadState((s) => (s === "loading" ? "idle" : s))');
    expect(src).toMatch(/startMarkerLoadDeadline\([\s\S]*?\}, 20000\)/);
  });
});
