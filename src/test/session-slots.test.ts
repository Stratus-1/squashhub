import { describe, it, expect } from "vitest";
import { placeGamesInSessions, sessionSlots } from "@/lib/smart-builder/session-slots";

describe("session slots", () => {
  const days = [
    { date: "2026-10-14", from: "18:00", to: "21:00", courtIds: [20, 21, 24] },
    { date: "2026-10-13", from: "18:00", to: "21:00", courtIds: ["20", "21", "24"] },
  ];
  it("35-min slots: 5 per evening x 3 courts x 2 days", () => {
    const s = sessionSlots(days, 35);
    expect(s.length).toBe(30);
    expect(s[0]).toEqual({ date: "2026-10-13", time: "18:00", court: 20 });
    expect(s[1].court).toBe(21);
    expect(s[3]).toEqual({ date: "2026-10-13", time: "18:35", court: 20 });
  });
  it("overflow stays unplaced", () => {
    const ids = Array.from({ length: 35 }, (_, i) => `g${i}`);
    const r = placeGamesInSessions(ids, days, 35);
    expect(r.placed.length).toBe(30);
    expect(r.unplaced.length).toBe(5);
  });
});
