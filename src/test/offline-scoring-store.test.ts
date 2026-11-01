import { describe, it, expect, beforeEach } from "vitest";
import {
  loadOfflineSession, saveOfflineSession, clearOfflineSession, isNetworkError, retryDelayMs,
  type OfflineSession,
} from "@/lib/device-scoring/offlineScoring";

const s: OfflineSession = {
  matchId: "m1", sessionId: "s1", ids: { a: "a", b: "b", pa: null, pb: null },
  revision: 3, acked: 2, pending: { games: [{ a: 7, b: 5 }], current: { a: 2, b: 1 } }, result: null,
};

describe("offline scoring store", () => {
  beforeEach(() => localStorage.clear());
  it("keeps unsent scores on the phone per match", () => {
    saveOfflineSession(s);
    expect(loadOfflineSession("m1")?.pending?.current).toEqual({ a: 2, b: 1 });
    expect(loadOfflineSession("m2")).toBeNull();
    clearOfflineSession("m1");
    expect(loadOfflineSession("m1")).toBeNull();
  });
  it("retries network failures but not server refusals", () => {
    expect(isNetworkError({ message: "Failed to fetch" })).toBe(true);
    expect(isNetworkError({ message: "already being scored on another device", code: "P0001" })).toBe(false);
    expect(retryDelayMs(0)).toBe(2000);
    expect(retryDelayMs(10)).toBe(30000);
  });
});
