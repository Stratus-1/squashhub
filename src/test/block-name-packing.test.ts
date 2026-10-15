import { describe, it, expect } from "vitest";
import { allocateRoundSlots, isTournamentHold } from "@/lib/tournaments/round-scheduling";

const hold = (court: number, s: string, e: string, name = "1; Club Championships") => ({ id: `${court}${s}`, court_id: court, date: "2026-10-27", start_time: s, end_time: e, status: "active", external_booker_name: name });
const rows = ["18:00", "18:45", "19:30", "20:15"].map((s, i) => hold(1, s, ["18:45", "19:30", "20:15", "21:00"][i]));
const m = (i: number) => ({ id: `m${i}`, players: [`a${i}`, `b${i}`] });
const win = { date: "2026-10-27", from: "18:00", to: "21:00", courtIds: [1, 2], minutes: 35 };

describe("named GoBook blocks with 35-min games", () => {
  it("packs back-to-back 35-min games across consecutive 45-min block rows", () => {
    const r = allocateRoundSlots([1, 2, 3, 4, 5, 6].map(m), win, rows as any, { blockName: "Club Championships" });
    expect(r.assign.map((a: any) => a.time)).toEqual(["18:00", "18:35", "19:10", "19:45", "20:20"]);
    expect(r.unplaced.map((u) => u.matchId)).toEqual(["m6"]);
  });
  it("only uses matching blocks when a name is set (no free court time)", () => {
    const r = allocateRoundSlots([m(1)], win, [hold(2, "18:00", "21:00", "Social night")] as any, { blockName: "Club Championships", allowUnreserved: false });
    expect(r.assign).toHaveLength(0);
  });
  it("never treats player-named bookings as blocks", () => {
    expect(isTournamentHold({ ...hold(1, "18:00", "18:45"), club_member_id: "x" } as any, "Club Championships")).toBe(false);
  });
});
