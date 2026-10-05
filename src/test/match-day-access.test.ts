import { describe, it, expect } from "vitest";
import { courtNowNext, courtsUsed, matchDayPath, matchDayUrl, upcoming, results, tournamentStandings } from "@/lib/match-day/access";

const m = (id: string, date: string, time: string, court: number | null, status = "scheduled", extra: any = {}) =>
  ({ id, date, time, court_id: court, status, side_a: "A" + id, side_b: "B" + id, ...extra });

describe("match day access", () => {
  it("builds overall, court and match links from one token", () => {
    expect(matchDayPath("tok")).toBe("/md/tok");
    expect(matchDayPath("tok", { court: 3 })).toBe("/md/tok/court/3");
    expect(matchDayPath("tok", { court: 3, matchId: "x" })).toBe("/md/tok/court/3?match=x");
    expect(matchDayUrl("tok", { origin: "https://a.b" })).toBe("https://a.b/md/tok");
  });

  it("court link always resolves today's current and next match (weekend tournament)", () => {
    const ms = [m("1", "2026-10-10", "09:00", 3, "completed"), m("2", "2026-10-10", "09:45", 3), m("3", "2026-10-10", "10:30", 3), m("4", "2026-10-10", "09:45", 1)];
    const r = courtNowNext(ms, 3, "2026-10-10");
    expect(r.current?.id).toBe("2");
    expect(r.next?.id).toBe("3");
  });

  it("multi-week Club Champs: same court link moves to the following week", () => {
    const ms = [m("1", "2026-10-01", "18:00", 2, "completed"), m("2", "2026-10-08", "18:00", 2)];
    expect(courtNowNext(ms, 2, "2026-10-05").current).toBeNull();
    expect(courtNowNext(ms, 2, "2026-10-05").next?.id).toBe("2");
    expect(courtNowNext(ms, 2, "2026-10-08").current?.id).toBe("2");
  });

  it("league season: fixtures/results split and courts used", () => {
    const ms = [m("1", "2026-03-01", "18:00", 1, "submitted"), m("2", "2026-10-06", "18:00", 2), m("3", "2026-10-06", "18:00", null)];
    expect(upcoming(ms, "2026-10-05").map((x) => x.id)).toEqual(["2", "3"]);
    expect(results(ms).map((x) => x.id)).toEqual(["1"]);
    expect(courtsUsed(ms)).toEqual([1, 2]);
  });

  it("standings count completed pool matches only", () => {
    const ms = [m("1", "2026-10-10", "09:00", 1, "completed", { winner: "a", group: 1, side_a: "X", side_b: "Y" }), m("2", "2026-10-10", "09:00", 1, "scheduled", { group: 1 })];
    const s = tournamentStandings(ms);
    expect(s.find((r) => r.name === "X")?.points).toBe(2);
    expect(s).toHaveLength(2);
  });
});
