import { describe, expect, it } from "vitest";
import {
  activeField, capacity, fieldSizeForStage, milestoneFor, pacePlan, proposePairings, roundsLeftFor,
} from "@/lib/tournaments/paced-knockout";

const field = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, rank: i + 1 }));
const ko = (round: number, a: string, b: string, winner?: string) => ({
  stage: "ko", group_number: 1, round_number: round, player_a_member_id: a, player_b_member_id: b,
  status: winner ? "completed" : "scheduled", winner_member_id: winner ?? null,
});

describe("pace", () => {
  it("paces a small field: 9 → QF over 3 rounds plays one match now", () => {
    expect(pacePlan({ active: 9, target: 8, roundsLeft: 3, pace: "paced" })).toMatchObject({ needed: 1, thisRound: 1, status: "on_track" });
  });
  it("12 → 8 over 3 rounds plays 2; 20 → 8 plays 4", () => {
    expect(pacePlan({ active: 12, target: 8, roundsLeft: 3, pace: "paced" }).thisRound).toBe(2);
    expect(pacePlan({ active: 20, target: 8, roundsLeft: 3, pace: "paced" }).thisRound).toBe(4);
  });
  it("immediate plays as many as the field allows, never overshooting", () => {
    expect(pacePlan({ active: 20, target: 8, roundsLeft: 3, pace: "immediate" }).thisRound).toBe(10);
    expect(pacePlan({ active: 9, target: 8, roundsLeft: 3, pace: "immediate" }).thisRound).toBe(1);
  });
  it("warns when the schedule is at risk after a lost round", () => {
    const p = pacePlan({ active: 14, target: 4, roundsLeft: 2, pace: "paced", milestoneLabel: "Semi-finals" });
    expect(p.status).toBe("at_risk");
    expect(p.minimumNow).toBe(6);
    expect(p.warning).toContain("6 matches must now be completed");
  });
  it("reports behind when the milestone can no longer be reached", () => {
    expect(pacePlan({ active: 20, target: 8, roundsLeft: 1, pace: "paced" }).status).toBe("behind");
    expect(pacePlan({ active: 9, target: 8, roundsLeft: 0, pace: "paced" }).status).toBe("behind");
  });
  it("is done at the milestone and free without one", () => {
    expect(pacePlan({ active: 8, target: 8, roundsLeft: 2, pace: "paced" }).status).toBe("done");
    expect(pacePlan({ active: 7, target: null, roundsLeft: null, pace: "paced" })).toMatchObject({ status: "free", thisRound: 3 });
  });
  it("capacity never goes below the target", () => {
    expect(capacity(20, 2, 8)).toBe(12);
  });
});

describe("pairings", () => {
  it("traditional seeds strongest v weakest", () => {
    const { pairs, waiting } = proposePairings(field(8), 4, "traditional");
    expect(pairs.map(([a, b]) => `${a.id}v${b.id}`)).toEqual(["p1vp8", "p2vp7", "p3vp6", "p4vp5"]);
    expect(waiting).toHaveLength(0);
  });
  it("progressive pairs neighbours from the bottom and the strongest wait", () => {
    const { pairs, waiting } = proposePairings(field(9), 1, "progressive");
    expect(pairs.map(([a, b]) => `${a.id}v${b.id}`)).toEqual(["p8vp9"]);
    expect(waiting.map((w) => w.id)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
  });
  it("odd field leaves a player waiting (bye ≠ elimination)", () => {
    const { pairs, waiting } = proposePairings(field(5), 5, "traditional");
    expect(pairs).toHaveLength(2);
    expect(waiting.map((w) => w.id)).toEqual(["p1"]);
  });
});

describe("active field", () => {
  it("removes losers only; byes and unscheduled players stay active", () => {
    const rows = [ko(1, "p8", "p9", "p8"), { ...ko(1, "p1", null as any), is_bye: true }];
    const f = activeField(field(9), rows as any);
    expect(f.active.map((e) => e.id)).not.toContain("p9");
    expect(f.active).toHaveLength(8);
    expect(f.eliminated).toEqual([expect.objectContaining({ id: "p9", round: 1 })]);
    expect(f.roundOpen).toBe(false);
  });
  it("an unplayed fixture keeps the round open", () => {
    const f = activeField(field(4), [ko(1, "p3", "p4")] as any);
    expect(f.roundOpen).toBe(true);
    expect(f.inPlay.sort()).toEqual(["p3", "p4"]);
  });
});

describe("milestone (existing shared vs own option)", () => {
  const stages = [
    { phase: "main", name: "Round 1", deadline: "2026-10-10" },
    { phase: "main", name: "Round 2", deadline: "2026-10-17" },
    { phase: "main", name: "Round 3", deadline: "2026-10-24" },
    { phase: "playoff", name: "Semifinals Night", date: "2026-11-01" },
    { phase: "playoff", unit: "Ladies", name: "Quarter-finals", date: "2026-10-20" },
  ];
  it("shared stages apply when synchronised", () => {
    const m = milestoneFor({ stages, playoffSync: true }, "Mens::A");
    expect(m).toMatchObject({ source: "shared", fieldSize: 4, date: "2026-11-01" });
    expect(roundsLeftFor(m, 1)).toBe(2);
  });
  it("a league with its own stages follows them", () => {
    const m = milestoneFor({ stages, playoffSync: true }, "Ladies::B");
    expect(m).toMatchObject({ source: "own", fieldSize: 8 });
    expect(m.roundDates).toEqual(["2026-10-10", "2026-10-17"]);
  });
  it("per-category playoff dates ignore shared stages", () => {
    expect(milestoneFor({ stages, playoffSync: false }, "Mens").source).toBe("none");
  });
  it("reads field sizes from stage names", () => {
    expect(fieldSizeForStage("Finals Day")).toBe(2);
    expect(fieldSizeForStage("Round of 16")).toBe(16);
  });
});
