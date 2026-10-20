import { describe, it, expect } from "vitest";
import { allocateRoundSlots, diffRound, isTournamentHold, roundsForStage, stageSchedules, type LiveMatch, type LiveRound, type SlotBooking } from "./round-scheduling";

const D = "2026-10-21";
const hold = (id: string, court: number, s = "18:00", e = "20:15"): SlotBooking => ({ id, court_id: court, date: D, start_time: s, end_time: e, external_booker_name: "Club Championship" });
const w = { date: D, from: "18:00", to: "21:00", minutes: 45, courtIds: [1, 2] };

describe("allocateRoundSlots", () => {
  it("places matches inside tournament block holds, earliest first", () => {
    const r = allocateRoundSlots([{ id: "a", players: ["p1", "p2"] }, { id: "b", players: ["p3", "p4"] }], w, [hold("h1", 1), hold("h2", 2)]);
    expect(r.assign.map((a) => [a.matchId, a.courtId, a.time, a.source])).toEqual([["a", 1, "18:00", "block"], ["b", 2, "18:00", "block"]]);
  });
  it("never uses a personally named booking", () => {
    const named: SlotBooking = { id: "x", court_id: 1, date: D, start_time: "18:00", end_time: "18:45", club_member_id: "m9" };
    expect(isTournamentHold(named)).toBe(false);
    const r = allocateRoundSlots([{ id: "a", players: ["p1", "p2"] }], w, [hold("h1", 1), named]);
    expect(r.assign[0].time).toBe("18:45");
  });
  it("respects a player's own booking clash on another court", () => {
    const own: SlotBooking = { id: "y", court_id: 9, date: D, start_time: "18:00", end_time: "19:00", club_member_id: "p1" };
    expect(allocateRoundSlots([{ id: "a", players: ["p1", "p2"] }], w, [hold("h1", 1), own]).assign[0].time).toBe("19:30");
  });
  it("reports shortage instead of downgrading to play-by", () => {
    const r = allocateRoundSlots([1, 2, 3, 4].map((i) => ({ id: `m${i}`, players: [`a${i}`, `b${i}`] })), { ...w, courtIds: [1] }, [hold("h1", 1, "18:00", "19:30")]);
    expect(r.assign).toHaveLength(2);
    expect(r.unplaced.map((u) => u.matchId)).toEqual(["m3", "m4"]);
  });
  it("fails closed with no block and unreserved not allowed", () => {
    expect(allocateRoundSlots([{ id: "a", players: ["p1", "p2"] }], w, []).unplaced).toHaveLength(1);
  });
  it("uses free court time after block slots when allowed, avoiding external bookings", () => {
    const ext: SlotBooking = { id: "g", court_id: 2, date: D, start_time: "18:00", end_time: "19:00", external_booker_name: "GoBook: Smith" };
    const r = allocateRoundSlots([{ id: "a", players: ["p1", "p2"] }, { id: "b", players: ["p3", "p4"] }], { ...w, to: "19:30" }, [hold("h1", 1, "18:00", "18:45"), ext], { allowUnreserved: true });
    expect(r.assign[0]).toMatchObject({ matchId: "a", courtId: 1, time: "18:00", source: "block" });
    expect(r.assign[1]).toMatchObject({ matchId: "b", source: "unreserved" });
    expect(r.assign[1].courtId === 2 && r.assign[1].time < "19:00").toBe(false);
  });
  it("spreads over multiple saved days", () => {
    const r = allocateRoundSlots([{ id: "a", players: ["p1", "p2"] }, { id: "b", players: ["p1", "p3"] }],
      [{ ...w, courtIds: [1], to: "18:45" }, { date: "2026-10-22", from: "18:00", to: "18:45", minutes: 45, courtIds: [1] }], [], { allowUnreserved: true });
    expect(r.assign.map((a) => a.date)).toEqual([D, "2026-10-22"]);
  });
});

const plan = { stages: [
  { id: "s1", name: "Round 1", mode: "scheduled", date: D, from: "18:00", to: "20:00", courtIds: ["1"], deadline: null },
  { id: "s2", name: "Round 2", mode: "play_by", date: D, from: "18:00", to: "20:00", courtIds: ["1"], deadline: "2026-11-13", extraDays: [] },
] };
const round = (id: string, label: string, n: number, mode: string, play_by: string | null = null): LiveRound => ({ id, label, round_number: n, scheduling_mode: mode, play_by, group_number: 3 });
const m = (id: string, round_id: string, x: Partial<LiveMatch> = {}): LiveMatch => ({ id, round_id, status: "scheduled", is_bye: false, booking_id: null, scheduled_date: null, scheduled_time: null, court_id: null, play_by: null, player_a_member_id: "a", player_b_member_id: "b", ...x });

describe("reconcile diff (Riverside Round 2 shape)", () => {
  const stages = stageSchedules(plan);
  it("maps saved stages to live rounds by label", () => {
    expect(roundsForStage(stages[1], [round("r1", "Round 1", 1, "club"), round("r2", "Round 2", 2, "self")]).map((r) => r.id)).toEqual(["r2"]);
  });
  it("Play by: preserves unbooked allocations, completed results and players' own bookings", () => {
    const rounds = [round("r2", "Round 2", 2, "self")];
    const ms = [
      m("open", "r2", { scheduled_date: "2026-10-19", scheduled_time: "17:20", court_id: 20 }),
      m("done", "r2", { status: "completed", scheduled_date: "2026-10-19", court_id: 24 }),
      m("own", "r2", { booking_id: "bk1", scheduled_date: "2026-10-20", court_id: 26 }),
    ];
    const d = diffRound(stages[1], rounds, ms);
    expect(d.roundsToUpdate).toEqual(["r2"]);
    expect(d.clearAllocations).toEqual([]);
    expect(d.keepPlayerBookings).toEqual(["open", "own"]);
    expect(d.untouched).toBe(1);
    expect(d.inSync).toBe(false);
  });
  it("Play by: organiser allocations from a timed round stay booked", () => {
    const d = diffRound(stages[1], [round("r2", "Round 2", 2, "club")], [m("x", "r2", { booking_id: "bk", scheduled_date: D, court_id: 1 })]);
    expect(d.clearAllocations).toEqual([]);
    expect(d.keepPlayerBookings).toEqual(["x"]);
  });
  it("is idempotent: in sync after apply", () => {
    const d = diffRound(stages[1], [round("r2", "Round 2", 2, "self", "2026-11-13")], [m("x", "r2", { play_by: "2026-11-13" }), m("c", "r2", { status: "completed", court_id: 1, scheduled_date: D })]);
    expect(d.inSync).toBe(true);
  });
  it("Timed: only confirmed, unslotted matches need allocation; provisional are counted, not allocated", () => {
    const d = diffRound(stages[0], [round("r1", "Round 1", 1, "self")], [m("need", "r1"), m("prov", "r1", { player_b_member_id: null }), m("has", "r1", { scheduled_date: D, court_id: 1, scheduled_time: "18:00" })]);
    expect(d.needAllocation).toEqual(["need"]);
    expect(d.provisional).toBe(1);
    expect(d.roundsToUpdate).toEqual(["r1"]);
  });
});

import { stageSignature, insideWindows } from "./round-scheduling";
describe("in-place round edits are detected immediately", () => {
  const plan = (patch: any) => ({ stages: [{ id: "st2", name: "Round 2", mode: "scheduled", date: D, from: "18:00", to: "21:00", courtIds: ["1", "2"], ...patch }] });
  const rounds: LiveRound[] = [{ id: "r2", label: "Round 2", round_number: 2, scheduling_mode: "club", play_by: null, group_number: 1 }];
  const m = (o: Partial<LiveMatch>): LiveMatch => ({ id: "m1", round_id: "r2", status: "scheduled", is_bye: false, booking_id: null, scheduled_date: D, scheduled_time: "18:00", court_id: 1, play_by: null, player_a_member_id: "a", player_b_member_id: "b", ...o });
  it("in sync when allocation sits inside the window", () => {
    const [s] = stageSchedules(plan({}));
    expect(diffRound(s, rounds, [m({})]).inSync).toBe(true);
  });
  it("timed date change flags fixtures outside the new window", () => {
    const [s] = stageSchedules(plan({ date: "2026-10-28" }));
    const d = diffRound(s, rounds, [m({})]);
    expect(d.inSync).toBe(false); expect(d.outsideWindow).toEqual(["m1"]);
  });
  it("court and time window changes are detected", () => {
    expect(diffRound(stageSchedules(plan({ courtIds: ["2"] }))[0], rounds, [m({})]).outsideWindow).toEqual(["m1"]);
    expect(diffRound(stageSchedules(plan({ from: "19:00" }))[0], rounds, [m({})]).outsideWindow).toEqual(["m1"]);
  });
  it("play-by deadline edit needs refresh; completed results untouched", () => {
    const pr: LiveRound[] = [{ ...rounds[0], scheduling_mode: "self", play_by: "2026-11-13" }];
    const [s] = stageSchedules(plan({ mode: "play_by", deadline: "2026-11-20" }));
    const d = diffRound(s, pr, [m({ scheduled_date: null, scheduled_time: null, court_id: null, play_by: "2026-11-13" }), m({ id: "m2", status: "completed" })]);
    expect(d.inSync).toBe(false); expect(d.deadlineUpdates).toEqual(["m1"]); expect(d.untouched).toBe(1);
  });
  it("signature ignores non-meaningful differences", () => {
    const a = stageSchedules(plan({ courtIds: ["1", "2"] }))[0], b = stageSchedules(plan({ courtIds: ["2", "1"], deadline: "x" }))[0];
    expect(stageSignature(a)).toBe(stageSignature(b));
    expect(stageSignature(a)).not.toBe(stageSignature(stageSchedules(plan({ to: "22:00" }))[0]));
  });
  it("player-booked match in a self round is not flagged", () => {
    expect(insideWindows({ scheduled_date: D, scheduled_time: "18:30", court_id: 2 }, stageSchedules(plan({}))[0].windows)).toBe(true);
  });
});
