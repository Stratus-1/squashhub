import { describe, expect, it } from "vitest";
import { buildTierStandings } from "@/lib/leagues/team-standings";
import { activeSeasonPenalties, applyTeamPenalties, type TeamPenalty } from "@/lib/leagues/team-penalties";

const pen = (o: Partial<TeamPenalty>): TeamPenalty => ({
  id: o.id ?? "p1", team_code: o.team_code ?? "T2", points: o.points ?? 5, rule_name: "Late result",
  reason: null, fixture_id: o.fixture_id ?? null, season_id: o.season_id ?? "s26",
  effective_date: o.effective_date ?? "2026-10-06", applied_at: "2026-10-07T00:00:00Z",
  reversed_at: o.reversed_at ?? null,
});

const base = () => buildTierStandings(
  [{ id: "a", fixture_date: "2026-10-06", home_team_code: "T1", away_team_code: "T2", status: null, round_id: null }],
  [{ fixture_id: "a", home_total_points: 13, away_total_points: 16, status: "submitted" }],
).rows;

describe("team penalties", () => {
  it("deducts from season total, re-sorts, keeps fixture score untouched", () => {
    const rows = applyTeamPenalties(base(), [pen({ points: 5 })]);
    expect(rows.map((r) => r.team_code)).toEqual(["T1", "T2"]);
    const t2 = rows.find((r) => r.team_code === "T2")!;
    expect(t2).toMatchObject({ total: 16, penalty: 5, adjusted: 11 });
    expect(t2.weeks[0].value).toBe("16-13");
  });
  it("negative stored value never adds points; duplicates and reversals ignored", () => {
    const rows = applyTeamPenalties(base(), [
      pen({ points: -3 }), pen({ points: -3 }), pen({ id: "p2", points: 4, reversed_at: "2026-10-08" }),
    ]);
    expect(rows.find((r) => r.team_code === "T2")).toMatchObject({ penalty: 3, adjusted: 13 });
  });
  it("season isolation", () => {
    const list = [pen({ season_id: "s25", effective_date: "2025-05-01" }), pen({ id: "x", season_id: null, effective_date: "2026-03-01" })];
    expect(activeSeasonPenalties(list, { id: "s26", season_year: 2026 }).map((p) => p.id)).toEqual(["x"]);
  });
  it("no penalties = unchanged standings", () => {
    expect(applyTeamPenalties(base(), []).map((r) => [r.team_code, r.adjusted])).toEqual([["T2", 16], ["T1", 13]]);
  });
});
