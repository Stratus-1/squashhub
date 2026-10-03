import { describe, expect, it } from "vitest";
import { fixtureRoundRow, resolveFixtureSchedule, stageScheduleIndex } from "@/lib/tournaments/stage-schedule";
import { canScheduleFixture } from "@/lib/tournaments/fixture-scheduling";

const rows = [
  { id: "r-pool1", round_number: 1, group_number: 1, section_number: 1, stage_key: "main", label: "Round 1", play_by: "2026-10-06" },
  { id: "r-qf", round_number: 1, group_number: 1, section_number: 1, stage_key: "po1", label: "Quarterfinals", play_by: null },
  { id: "r-sf", round_number: 1, group_number: 1, section_number: 1, stage_key: "po2", label: "Semifinals", play_by: null },
  { id: "r-f", round_number: 1, group_number: 1, section_number: 1, stage_key: "po3", label: "Final", play_by: null },
];
const spec = (rule: "play_by" | "fixed") => ({
  divisions: [{ stages: [
    { id: "main", name: "Pools", order: 0, schedule: { rule: "play_by", deadline: "2026-10-17", roundDates: ["2026-10-06"] } },
    { id: "po1", name: "Quarterfinals", order: 1, schedule: rule === "fixed" ? { rule, date: "2026-10-22", timeFrom: "08:00", timeTo: "18:00", courtIds: [20] } : { rule, deadline: "2026-10-22" } },
    { id: "po2", name: "Semifinals", order: 2, schedule: rule === "fixed" ? { rule, date: "2026-10-25", timeFrom: "16:25", timeTo: "20:25", courtIds: [20] } : { rule, deadline: "2026-10-25" } },
    { id: "po3", name: "Final", order: 3, schedule: rule === "fixed" ? { rule, date: "2026-10-28", timeFrom: "10:25", timeTo: "17:25", courtIds: [20] } : { rule, deadline: "2026-10-28" } },
  ] }],
});
const fx = (stage_key: string, extra: any = {}) => ({ round_number: 1, group_number: 1, section_number: 1, stage_key, round_id: null, ...extra });

describe("target-stage schedule: pool 6 Oct -> QF 22 -> SF 25 -> Final 28", () => {
  it("play-by stages use their own deadline, never the pool's 6 Oct", () => {
    const idx = stageScheduleIndex(spec("play_by"));
    const want: Record<string, string> = { po1: "2026-10-22", po2: "2026-10-25", po3: "2026-10-28" };
    for (const k of ["po1", "po2", "po3"]) {
      const r = resolveFixtureSchedule(fx(k), { stage: idx.get(k), rows, fallback: () => "2026-10-06" });
      expect(r.playBy).toBe(want[k]);
      expect(r.playBy).not.toBe("2026-10-06");
    }
    expect(resolveFixtureSchedule(fx("main"), { stage: idx.get("main"), rows }).playBy).toBe("2026-10-06");
  });

  it("fixed stages are centrally scheduled on their own date with no play-by or booking prompt", () => {
    const idx = stageScheduleIndex(spec("fixed"));
    const r = resolveFixtureSchedule(fx("po3", { scheduled_date: "2026-10-28" }), { stage: idx.get("po3"), rows, fallback: () => "2026-10-06" });
    expect(r.mode).toBe("scheduled");
    expect(r.playBy).toBeNull();
    if (r.mode === "scheduled") { expect(r.date).toBe("2026-10-28"); expect(r.allocated).toBe(false); expect(r.window).toEqual({ from: "10:25", to: "17:25" }); }
    const m = { player_a_member_id: "a", player_b_member_id: "b", status: "scheduled" } as any;
    expect(canScheduleFixture(m, "a", { centrallyScheduled: true }).allowed).toBe(false);
    expect(canScheduleFixture(m, "x", { canManage: true, centrallyScheduled: true }).allowed).toBe(true);
  });

  it("a staged fixture never borrows another stage's round row", () => {
    expect(fixtureRoundRow(fx("po3"), rows)?.id).toBe("r-f");
    expect(fixtureRoundRow(fx("po3", { round_id: "r-f" }), rows)?.id).toBe("r-f");
    expect(fixtureRoundRow(fx("po9"), rows)).toBeUndefined();
    // no spec at all: still never the pool's 6 Oct for a play-off stage
    expect(resolveFixtureSchedule(fx("po3"), { rows }).playBy).toBeNull();
  });

  it("keeps a player-booked knockout's round deadline and reschedule permission", () => {
    const booked = fx("po2", { round_id: "r-sf", scheduled_date: "2026-10-23", scheduled_time: "18:00", booking_id: "booking-1" });
    const r = resolveFixtureSchedule(booked, { stage: stageScheduleIndex(spec("play_by")).get("po2"), rows });
    expect(r).toMatchObject({ mode: "play_by", playBy: "2026-10-25" });
    const m = { ...booked, stage: "ko", status: "scheduled", player_a_member_id: "a", player_b_member_id: "b" } as any;
    expect(canScheduleFixture(m, "a", { centrallyScheduled: r.mode === "scheduled" }).allowed).toBe(true);
    expect(canScheduleFixture(m, "outsider", { centrallyScheduled: r.mode === "scheduled" }).allowed).toBe(false);
    const legacy = resolveFixtureSchedule({ ...booked, stage_key: null }, { rows: [{ ...rows[0], stage_key: null, play_by: "2026-10-25" }] });
    expect(legacy.playBy).toBe("2026-10-25");
  });
});
