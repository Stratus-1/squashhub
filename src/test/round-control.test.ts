import { describe, it, expect } from "vitest";
import { divisionControls, groupStageControl, isScheduled } from "@/lib/tournaments/round-control";

const ko = (o: any) => ({
  stage: "ko",
  group_number: 1,
  section_number: 1,
  is_bye: false,
  status: "scheduled",
  ...o,
});

describe("round control", () => {
  it("asks for scheduling when a fresh round has no dates", () => {
    const m = [
      ko({ round_number: 1, player_a_member_id: "a", player_b_member_id: "b" }),
      ko({ round_number: 1, player_a_member_id: "c", player_b_member_id: "d" }),
    ];
    const s = divisionControls(m as any)[0].sections[0];
    expect(s.action).toBe("schedule");
    expect(s.unscheduled).toBe(2);
    expect(s.headline).toMatch(/unscheduled/);
  });

  it("never nags about courts when players schedule themselves", () => {
    const m = [ko({ round_number: 1, player_a_member_id: "a", player_b_member_id: "b" })];
    const s = divisionControls(m as any, [], { selfScheduled: true })[0].sections[0];
    expect(s.action).toBe("await_results");
    expect(s.actionLabel).toBeNull();
  });

  it("offers the next round only once the current one is played out", () => {
    const rows = [
      ko({ round_number: 1, scheduled_date: "2026-03-01", player_a_member_id: "a", player_b_member_id: "b", status: "completed", winner_member_id: "a" }),
      ko({ round_number: 1, scheduled_date: "2026-03-01", player_a_member_id: "c", player_b_member_id: "d" }),
    ];
    expect(divisionControls(rows as any)[0].sections[0].action).toBe("await_results");

    rows[1] = ko({ round_number: 1, scheduled_date: "2026-03-01", player_a_member_id: "c", player_b_member_id: "d", status: "completed", winner_member_id: "c" });
    const s = divisionControls(rows as any)[0].sections[0];
    expect(s.action).toBe("generate");
    expect(s.actionLabel).toBe("Generate Final");
    expect(s.headline).toMatch(/2 players remain/);
  });

  it("marks a decided draw and stops asking for anything", () => {
    const rows = [
      ko({ round_number: 3, scheduled_date: "2026-03-20", player_a_member_id: "a", player_b_member_id: "b", status: "completed", winner_member_id: "a" }),
    ];
    const s = divisionControls(rows as any)[0].sections[0];
    expect(s.decided).toBe(true);
    expect(s.action).toBe("none");
    expect(s.winner).toBe("a");
  });

  it("keeps divisions independent", () => {
    const rows = [
      ko({ group_number: 1, round_number: 1, player_a_member_id: "a", player_b_member_id: "b", status: "completed", winner_member_id: "a", scheduled_date: "x" }),
      ko({ group_number: 2, round_number: 1, player_a_member_id: "c", player_b_member_id: "d", scheduled_date: "x" }),
    ];
    const [d1, d2] = divisionControls(rows as any);
    expect(d1.decided).toBe(true);
    expect(d2.decided).toBe(false);
    expect(d2.focus?.action).toBe("await_results");
  });

  it("reports the pool stage hand-off", () => {
    const g = (o: any) => ({ stage: "group", group_number: 1, is_bye: false, ...o });
    const rows = [
      g({ player_a_member_id: "a", player_b_member_id: "b", status: "completed" }),
      g({ player_a_member_id: "c", player_b_member_id: "d", status: "completed" }),
    ];
    const c = groupStageControl(rows as any, 1)!;
    expect(c.complete).toBe(true);
    expect(c.action).toBe("generate");
    expect(c.headline).toMatch(/4 players qualified/);
  });

  it("treats a court-only fixture as scheduled", () => {
    expect(isScheduled({ court_id: 3 } as any)).toBe(true);
    expect(isScheduled({} as any)).toBe(false);
  });
});
