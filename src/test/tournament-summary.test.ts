import { describe, expect, it } from "vitest";
import { formalStageOf, tournamentSummary, type SummaryFixture } from "@/lib/tournaments/tournament-summary";

const cats = [
  { group: 2, label: "Boys", firstStage: "sf" as const, fieldReady: true },
  { group: 1, label: "Men's 1st", firstStage: "sf" as const },
];
const fixture = (group: number, label: string, a: string, b: string, winner?: string): SummaryFixture => ({
  group_number: group, stage: "ko", stage_label: label, player_a_member_id: a, player_b_member_id: b,
  winner_member_id: winner, status: winner ? "completed" : "scheduled", score: winner ? "3-1" : null,
});

describe("tournament summary", () => {
  it("retains configured order, excludes early paced rounds and shows independent progress", () => {
    const rows = tournamentSummary(cats, [fixture(2, "Round 1", "x", "y", "x"), fixture(1, "Semifinal", "a", "b", "a")]);
    expect(rows.map((r) => r.category.label)).toEqual(["Boys", "Men's 1st"]);
    expect(rows[0].status).toMatch(/Semifinal field ready/);
    expect(rows[0].semifinals).toHaveLength(0);
    expect(rows[1].semifinals).toHaveLength(1);
    expect(rows[1].champion).toBeNull();
  });
  it("resolves the champion only from the completed Final and retains score", () => {
    const rows = tournamentSummary(cats, [fixture(2, "Semifinal", "a", "b", "a"), fixture(2, "Final", "a", "c", "c")]);
    expect(rows[0].champion?.winner_member_id).toBe("c");
    expect(rows[0].champion && rows[0].champion.score).toBe("3-1");
  });
  it("supports QF-first and Final-only without inventing a QF from a knockout round", () => {
    expect(formalStageOf(fixture(2, "Round 2", "a", "b"))).toBeNull();
    const rows = tournamentSummary([{ group: 1, label: "Open", firstStage: "qf" }, { group: 2, label: "Pairs", firstStage: "final" }],
      [fixture(1, "Quarterfinal", "a", "b"), fixture(2, "Final", "c", "d")]);
    expect(rows[0].status).toBe("Quarterfinals in progress");
    expect(rows[1].finals).toHaveLength(1);
    expect(rows[1].semifinals).toHaveLength(0);
  });
});