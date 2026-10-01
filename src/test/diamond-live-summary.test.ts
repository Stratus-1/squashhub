import { describe, expect, it } from "vitest";
import { diamondLiveSummary } from "@/lib/tournaments/diamond-live-summary";
import type { StandingRow } from "@/lib/tournaments/team-league";

const row = (teamId: string, total: number): StandingRow => ({
  teamId, played: 0, won: 0, points: total, against: 0, bonus: 0, games: 0, total,
});

describe("Diamond League live summary", () => {
  it("uses semi-final running totals and live teams instead of frozen pool totals", () => {
    const summary = diamondLiveSummary(
      [row("pool-leader", 160), row("pool-last", 100)],
      new Set(["pool-leader"]),
      { rows: [row("semi-leader", 205), row("semi-last", 170)], liveTeamIds: new Set(["semi-leader"]) },
    );

    expect(summary.rows.map((item) => item.teamId)).toEqual(["semi-leader", "semi-last"]);
    expect(summary.liveTeamIds).toEqual(new Set(["semi-leader"]));
  });

  it("prefers final running totals when finals exist", () => {
    const summary = diamondLiveSummary(
      [row("pool-leader", 160)],
      new Set(),
      { rows: [row("semi-leader", 205)], liveTeamIds: new Set() },
      { rows: [row("final-leader", 250)], liveTeamIds: new Set(["final-leader"]) },
    );

    expect(summary.rows[0]?.teamId).toBe("final-leader");
    expect(summary.liveTeamIds.has("final-leader")).toBe(true);
  });
});