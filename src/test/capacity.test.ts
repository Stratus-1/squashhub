import { describe, it, expect } from "vitest";
import {
  computeCapacity,
  deriveSessions,
  formatCourtMinutes,
  maxEntitiesForGames,
  missingCapacityInputs,
  type CapacityLeagueInput,
} from "@/lib/tournaments/capacity";

const league = (over: Partial<CapacityLeagueInput> = {}): CapacityLeagueInput => ({
  groupNumber: 1,
  format: "single_round_robin",
  slotMinutes: 20,
  pools: 1,
  entities: 0,
  playoffs: false,
  ...over,
});

const baseDerive = {
  customizeDailySchedule: false,
  daySchedules: [],
  startDate: "2026-09-05",
  endDate: "2026-09-05",
  playDays: [6], // Saturday
  startTime: "08:00",
  endTime: "18:00",
  selectedCourtIds: [1, 2, 3, 4],
};

describe("deriveSessions", () => {
  it("builds one session per play day with the global window", () => {
    const s = deriveSessions(baseDerive);
    expect(s).toEqual([{ date: "2026-09-05", minutes: 600, courts: 4 }]);
  });

  it("returns nothing when courts or dates are missing", () => {
    expect(deriveSessions({ ...baseDerive, selectedCourtIds: [] })).toHaveLength(0);
    expect(deriveSessions({ ...baseDerive, startDate: "" })).toHaveLength(0);
  });

  it("uses per-day windows and their court subsets when customised", () => {
    const s = deriveSessions({
      ...baseDerive,
      customizeDailySchedule: true,
      daySchedules: [
        { date: "2026-09-05", start_time: "10:00", end_time: "12:00", court_ids: [1, 2] },
        { date: "2026-09-05", start_time: "14:00", end_time: "16:00", court_ids: null },
      ],
    });
    expect(s).toEqual([
      { date: "2026-09-05", minutes: 120, courts: 2 },
      { date: "2026-09-05", minutes: 120, courts: 4 },
    ]);
  });

  it("ignores courts in a window that are not selected for the tournament", () => {
    const s = deriveSessions({
      ...baseDerive,
      customizeDailySchedule: true,
      daySchedules: [{ date: "2026-09-05", start_time: "10:00", end_time: "12:00", court_ids: [1, 99] }],
    });
    expect(s[0].courts).toBe(1);
  });
});

describe("missingCapacityInputs", () => {
  it("is empty when everything is set", () => {
    expect(missingCapacityInputs({ ...baseDerive, leagues: [league()] })).toEqual([]);
  });

  it("flags dates, courts, structure and duration", () => {
    expect(missingCapacityInputs({ ...baseDerive, startDate: "", leagues: [league()] })).toContain("dates");
    expect(missingCapacityInputs({ ...baseDerive, selectedCourtIds: [], leagues: [league()] })).toContain("courts");
    expect(missingCapacityInputs({ ...baseDerive, leagues: [] })).toContain("structure");
    expect(missingCapacityInputs({ ...baseDerive, leagues: [league({ slotMinutes: 0 })] })).toContain("duration");
  });

  it("flags an invalid time window", () => {
    expect(missingCapacityInputs({ ...baseDerive, endTime: "08:00", leagues: [league()] })).toContain("times");
  });
});

describe("computeCapacity", () => {
  const sessions = [{ date: "2026-09-05", minutes: 600, courts: 4 }];

  it("reports available court time and readiness", () => {
    const r = computeCapacity({ sessions, leagues: [league()], isDoubles: false, parallelLeagues: false, crossLeague: false });
    expect(r.ready).toBe(true);
    expect(r.totalCourtMinutes).toBe(2400);
    expect(r.maxCourts).toBe(4);
    expect(r.dayCount).toBe(1);
  });

  it("is not ready without sessions or a match duration", () => {
    expect(computeCapacity({ sessions: [], leagues: [league()], isDoubles: false, parallelLeagues: false, crossLeague: false }).ready).toBe(false);
    expect(computeCapacity({ sessions, leagues: [league({ slotMinutes: 0 })], isDoubles: false, parallelLeagues: false, crossLeague: false }).ready).toBe(false);
  });

  it("sizes a round-robin from real court time", () => {
    // 600/20 = 30 slots × 4 courts = 120 games → max N where N(N-1)/2 <= 120 → 16
    const r = computeCapacity({ sessions, leagues: [league()], isDoubles: false, parallelLeagues: false, crossLeague: false });
    expect(r.perLeague[0].gamesAvailable).toBe(120);
    expect(r.maxPlayersTotal).toBe(16);
  });

  it("halves the field for a double round-robin", () => {
    const r = computeCapacity({ sessions, leagues: [league({ format: "double_round_robin" })], isDoubles: false, parallelLeagues: false, crossLeague: false });
    expect(r.maxPlayersTotal).toBe(11);
  });

  it("counts doubles entities as pairs", () => {
    const r = computeCapacity({ sessions, leagues: [league({ entities: 8 })], isDoubles: true, parallelLeagues: false, crossLeague: false });
    expect(r.plannedEntities).toBe(8);
    expect(r.plannedPlayers).toBe(16);
    expect(r.maxPlayersTotal).toBe(r.maxEntitiesTotal * 2);
  });

  it("splits courts between leagues in parallel mode", () => {
    const leagues = [league({ groupNumber: 1 }), league({ groupNumber: 2 })];
    const shared = computeCapacity({ sessions, leagues, isDoubles: false, parallelLeagues: false, crossLeague: false });
    const parallel = computeCapacity({ sessions, leagues, isDoubles: false, parallelLeagues: true, crossLeague: false });
    expect(shared.perLeague[0].gamesAvailable).toBe(120);
    expect(parallel.parallelApplied).toBe(true);
    expect(parallel.perLeague[0].gamesAvailable).toBe(60);
  });

  it("never splits courts when cross-league play is on", () => {
    const leagues = [league({ groupNumber: 1 }), league({ groupNumber: 2 })];
    const r = computeCapacity({ sessions, leagues, isDoubles: false, parallelLeagues: true, crossLeague: true });
    expect(r.parallelApplied).toBe(false);
  });

  it("uses each league's own match length", () => {
    const r = computeCapacity({
      sessions,
      leagues: [league({ groupNumber: 1, slotMinutes: 20 }), league({ groupNumber: 2, slotMinutes: 40 })],
      isDoubles: false,
      parallelLeagues: false,
      crossLeague: false,
    });
    expect(r.perLeague[0].gamesAvailable).toBe(120);
    expect(r.perLeague[1].gamesAvailable).toBe(60);
  });

  it("costs the plan in court minutes and detects an overflow bottleneck", () => {
    const small = [{ date: "2026-09-05", minutes: 60, courts: 1 }];
    const r = computeCapacity({ sessions: small, leagues: [league({ entities: 8 })], isDoubles: false, parallelLeagues: false, crossLeague: false });
    // 8 players round-robin = 28 games × 20 min = 560 court-minutes vs 60 available
    expect(r.requiredCourtMinutes).toBe(560);
    expect(r.fits).toBe(false);
    // Only 3 time slots in the hour, so the round limit bites before court time does
    expect(r.bottleneck).toMatch(/only has 3 20-minute slots/);
  });

  it("caps a Bells league by the number of time slots, not the number of courts", () => {
    // 09:00–15:00 = 360 min, 20 min slots, 4 courts → 18 time slots, 72 match slots
    const day = [{ date: "2026-09-05", minutes: 360, courts: 4 }];
    const r = computeCapacity({
      sessions: day,
      // Stored draw format may still say swiss; the Bells scoring mode wins.
      leagues: [league({ format: "swiss", scoring: "time_capped_points", slotMinutes: 20, entities: 0 })],
      isDoubles: true,
      parallelLeagues: false,
      crossLeague: false,
    });
    const L = r.perLeague[0];
    expect(L.isTimeCapped).toBe(true);
    expect(L.isSwiss).toBe(false);
    expect(L.slotsAvailable).toBe(18);
    expect(L.gamesAvailable).toBe(72);
    // 12 pairs = 66 matches over 11 rounds — both limits respected
    expect(L.maxEntities).toBe(12);
    expect(r.maxPlayersTotal).toBe(24);
  });

  it("flags a Bells field that cannot get through its rounds in the day", () => {
    const day = [{ date: "2026-09-05", minutes: 360, courts: 8 }];
    const r = computeCapacity({
      sessions: day,
      leagues: [league({ scoring: "time_capped_points", slotMinutes: 20, entities: 24 })],
      isDoubles: false,
      parallelLeagues: false,
      crossLeague: false,
    });
    expect(r.perLeague[0].roundsNeeded).toBe(23);
    expect(r.perLeague[0].shortfallRounds).toBe(5);
    expect(r.fits).toBe(false);
    expect(r.bottleneck).toMatch(/Extra courts will not help/);
  });


  it("returns fits=null while no field is planned", () => {
    const r = computeCapacity({ sessions, leagues: [league()], isDoubles: false, parallelLeagues: false, crossLeague: false });
    expect(r.fits).toBeNull();
  });

  it("adds play-off matches and the pre-play-off break to the cost", () => {
    const withPo = computeCapacity({
      sessions,
      leagues: [league({ entities: 8, playoffs: true })],
      isDoubles: false,
      parallelLeagues: false,
      crossLeague: false,
      playoffBreakMinutes: 60,
    });
    const without = computeCapacity({
      sessions,
      leagues: [league({ entities: 8 })],
      isDoubles: false,
      parallelLeagues: false,
      crossLeague: false,
    });
    expect(withPo.perLeague[0].playoffGames).toBeGreaterThan(0);
    expect(withPo.requiredCourtMinutes).toBeGreaterThan(without.requiredCourtMinutes);
    expect(withPo.totalCourtMinutes).toBeLessThan(without.totalCourtMinutes);
  });

  it("sizes Swiss leagues from rounds and pools", () => {
    const r = computeCapacity({
      sessions,
      leagues: [league({ format: "swiss", pools: 2, rounds: 5, entities: 16 })],
      isDoubles: false,
      parallelLeagues: false,
      crossLeague: false,
    });
    // 8 per pool → ceil(8/2)=4 games/round × 5 rounds × 2 pools = 40 games
    expect(r.perLeague[0].gamesNeeded).toBe(40);
    expect(r.fits).toBe(true);
  });
});

describe("helpers", () => {
  it("maxEntitiesForGames", () => {
    expect(maxEntitiesForGames(0)).toBe(0);
    expect(maxEntitiesForGames(1)).toBe(2);
    expect(maxEntitiesForGames(6)).toBe(4);
  });

  it("formatCourtMinutes", () => {
    expect(formatCourtMinutes(0)).toBe("0m");
    expect(formatCourtMinutes(90)).toBe("1h 30m");
    expect(formatCourtMinutes(120)).toBe("2h");
  });
});

describe("knockout capacity", () => {
  const sessions = [{ date: "2026-09-05", minutes: 600, courts: 4 }];

  it("needs exactly entrants - 1 matches, whatever the section count", () => {
    const one = computeCapacity({
      sessions,
      leagues: [league({ format: "knockout", pools: 1, entities: 16 })],
      isDoubles: false,
      parallelLeagues: false,
    });
    const four = computeCapacity({
      sessions,
      leagues: [league({ format: "knockout", pools: 4, entities: 16 })],
      isDoubles: false,
      parallelLeagues: false,
    });
    expect(one.perLeague[0].totalGamesNeeded).toBe(15);
    expect(four.perLeague[0].totalGamesNeeded).toBe(15);
    expect(four.perLeague[0].fits).toBe(true);
  });

  it("ignores a separate play-off stage for knockout leagues", () => {
    const res = computeCapacity({
      sessions,
      leagues: [league({ format: "knockout", pools: 2, entities: 8, playoffs: true })],
      isDoubles: false,
      parallelLeagues: false,
    });
    expect(res.perLeague[0].playoffGames).toBe(0);
    expect(res.perLeague[0].totalGamesNeeded).toBe(7);
  });

  it("reports a shortfall when there are not enough slots", () => {
    const res = computeCapacity({
      sessions: [{ date: "2026-09-05", minutes: 60, courts: 1 }],
      leagues: [league({ format: "knockout", pools: 2, entities: 16 })],
      isDoubles: false,
      parallelLeagues: false,
    });
    expect(res.perLeague[0].fits).toBe(false);
    expect(res.perLeague[0].maxEntities).toBe(4); // 3 slots → 4 entrants
  });
});
