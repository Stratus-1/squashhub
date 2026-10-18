import { describe, it, expect } from "vitest";
import { champsSlotStarts } from "@/lib/tournaments/self-schedule";

const hold = (court_id: number, start_time: string, end_time: string) => ({
  court_id, start_time, end_time, status: "active", external_booker_name: "Club Championships",
});

describe("champsSlotStarts — the Champs' own match-length slots inside reserved evenings", () => {
  it("35-min games in a contiguous 18:00–21:00 block of 45-min holds start at 18:00, 18:35, 19:10, 19:45, 20:20", () => {
    const holds = [
      hold(27, "18:00", "18:45"), hold(27, "18:45", "19:30"), hold(27, "19:30", "20:15"), hold(27, "20:15", "21:00"),
    ];
    expect(champsSlotStarts(holds, 35).get(27)).toEqual(["18:00", "18:35", "19:10", "19:45", "20:20"]);
  });
  it("a single 45-min hold fits only one 35-min game", () => {
    expect(champsSlotStarts([hold(27, "18:00", "18:45")], 35).get(27)).toEqual(["18:00"]);
  });
  it("a gap between holds is never bridged", () => {
    const holds = [hold(27, "18:00", "18:45"), hold(27, "20:15", "21:00")];
    expect(champsSlotStarts(holds, 35).get(27)).toEqual(["18:00", "20:15"]);
  });
  it("keeps courts separate", () => {
    const holds = [hold(27, "18:00", "19:30"), hold(35, "19:30", "21:00")];
    const out = champsSlotStarts(holds, 35);
    expect(out.get(27)).toEqual(["18:00", "18:35"]);
    expect(out.get(35)).toEqual(["19:30", "20:05"]);
  });
  it("ignores rows that are not club championship holds", () => {
    const rows = [
      { court_id: 27, start_time: "18:00", end_time: "21:00", status: "active", external_booker_name: "Centurion Juniors" },
      { court_id: 28, start_time: "18:00", end_time: "21:00", status: "active", external_booker_name: "Club Championships", club_member_id: "m1" },
    ];
    expect(champsSlotStarts(rows, 35).size).toBe(0);
  });
  it("45-min games in 45-min holds match the club grid", () => {
    const holds = [hold(27, "18:00", "18:45"), hold(27, "18:45", "19:30")];
    expect(champsSlotStarts(holds, 45).get(27)).toEqual(["18:00", "18:45"]);
  });
});
