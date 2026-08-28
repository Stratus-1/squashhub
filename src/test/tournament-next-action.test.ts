import { describe, it, expect } from "vitest";
import { tournamentNextAction } from "@/lib/tournaments/round-control";

const ko = (o: any) => ({
  stage: "ko",
  group_number: 1,
  section_number: 1,
  is_bye: false,
  status: "scheduled",
  ...o,
});
const grp = (o: any) => ({ stage: "group", group_number: 1, is_bye: false, status: "scheduled", ...o });

describe("tournament next action", () => {
  it("asks for the initial draw when nothing exists", () => {
    const na = tournamentNextAction([]);
    expect(na.stage).toBe("no_draw");
    expect(na.action).toBe("setup");
    expect(na.ctaLabel).toBe("Review & Generate");
  });

  it("chases pool results, then offers the knockout", () => {
    const rows = [
      grp({ player_a_member_id: "a", player_b_member_id: "b", status: "completed" }),
      grp({ player_a_member_id: "c", player_b_member_id: "d" }),
    ];
    expect(tournamentNextAction(rows as any).stage).toBe("pool_play");

    rows[1] = grp({ player_a_member_id: "c", player_b_member_id: "d", status: "completed" });
    const na = tournamentNextAction(rows as any);
    expect(na.stage).toBe("pool_complete");
    expect(na.ctaLabel).toBe("Generate knockout round");
    expect(na.groupNumber).toBe(1);
  });

  it("asks for dates & courts on a fresh unscheduled round", () => {
    const na = tournamentNextAction([
      ko({ round_number: 1, player_a_member_id: "a", player_b_member_id: "b" }),
      ko({ round_number: 1, player_a_member_id: "c", player_b_member_id: "d" }),
    ] as any);
    expect(na.stage).toBe("round_unscheduled");
    expect(na.action).toBe("schedule");
    expect(na.ctaLabel).toMatch(/^Set dates & courts for /);
  });

  it("chases results, disabling generation until the round is played out", () => {
    const rows = [
      ko({ round_number: 1, scheduled_date: "2026-03-01", player_a_member_id: "a", player_b_member_id: "b", status: "completed", winner_member_id: "a" }),
      ko({ round_number: 1, scheduled_date: "2026-03-01", player_a_member_id: "c", player_b_member_id: "d" }),
    ];
    const na = tournamentNextAction(rows as any);
    expect(na.stage).toBe("round_in_progress");
    expect(na.headline).toMatch(/1 of 2/);
  });

  it("offers the named next stage once the round is complete", () => {
    const rows = [
      ko({ round_number: 1, scheduled_date: "x", player_a_member_id: "a", player_b_member_id: "b", status: "completed", winner_member_id: "a" }),
      ko({ round_number: 1, scheduled_date: "x", player_a_member_id: "c", player_b_member_id: "d", status: "completed", winner_member_id: "c" }),
    ];
    const na = tournamentNextAction(rows as any);
    expect(na.stage).toBe("round_complete");
    expect(na.action).toBe("generate");
    expect(na.ctaLabel).toBe("Generate Next Round");
    expect(na.section).toBe(1);
  });

  it("reports completion with no progression CTA", () => {
    const na = tournamentNextAction([
      ko({ round_number: 3, scheduled_date: "x", player_a_member_id: "a", player_b_member_id: "b", status: "completed", winner_member_id: "a" }),
    ] as any);
    expect(na.complete).toBe(true);
    expect(na.ctaLabel).toBeNull();
  });

  it("never shows progression for a closed tournament", () => {
    const na = tournamentNextAction([
      ko({ round_number: 1, player_a_member_id: "a", player_b_member_id: "b" }),
    ] as any, [], { status: "completed" });
    expect(na.complete).toBe(true);
    expect(na.ctaLabel).toBeNull();
  });

  it("prioritises the division that needs generating over one awaiting results", () => {
    const rows = [
      ko({ group_number: 2, round_number: 1, scheduled_date: "x", player_a_member_id: "e", player_b_member_id: "f" }),
      ko({ group_number: 1, round_number: 1, scheduled_date: "x", player_a_member_id: "a", player_b_member_id: "b", status: "completed", winner_member_id: "a" }),
      ko({ group_number: 1, round_number: 1, scheduled_date: "x", player_a_member_id: "c", player_b_member_id: "d", status: "completed", winner_member_id: "c" }),
    ];
    const na = tournamentNextAction(rows as any);
    expect(na.action).toBe("generate");
    expect(na.groupNumber).toBe(1);
  });
});
