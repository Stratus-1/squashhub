import { describe, expect, it } from "vitest";
import { CHAMP_LOCK_FRESH_MS, CHAMP_OFFLINE_FRESH_MS, isLockFresh, type ChampMarkerLock } from "@/hooks/use-champ-marker-lock";

const lock = (heartbeatSecondsAgo: number, scoring_mode: "live" | "offline"): ChampMarkerLock => ({
  match_id: "m1",
  user_id: "u1",
  user_name: "Marker",
  heartbeat_at: new Date(Date.now() - heartbeatSecondsAgo * 1000).toISOString(),
  takeover_requested_by: null,
  takeover_requested_name: null,
  takeover_requested_at: null,
  takeover_declined_at: null,
  scoring_mode,
});

// Rule: a match being scored offline stays "LIVE · offline" for viewers long
// after the normal 60s heartbeat window, because the offline phone cannot
// send heartbeats. A live lock still goes stale after 60 seconds.
describe("offline live indicator lock freshness", () => {
  it("a live lock goes stale after the 60s heartbeat window", () => {
    expect(isLockFresh(lock(10, "live"))).toBe(true);
    expect(isLockFresh(lock(CHAMP_LOCK_FRESH_MS / 1000 + 30, "live"))).toBe(false);
  });

  it("an offline lock stays fresh well beyond the 60s window", () => {
    expect(isLockFresh(lock(5 * 60, "offline"))).toBe(true);
    expect(isLockFresh(lock(60 * 60, "offline"))).toBe(true);
  });

  it("an offline lock is not fresh forever", () => {
    expect(isLockFresh(lock(CHAMP_OFFLINE_FRESH_MS / 1000 + 60, "offline"))).toBe(false);
  });
});
