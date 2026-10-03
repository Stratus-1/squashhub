import { describe, it, expect } from "vitest";
import { activeField, koRoundState, milestoneFor, pacePlan, playoffPairings, playoffSteps } from "@/lib/tournaments/paced-knockout";

const rounds = ["2026-10-10", "2026-10-13", "2026-10-16", "2026-10-19"].map((d, i) => ({ name: `Round ${i + 1}`, phase: "main", deadline: d }));
const sf = (start?: string) => ({ name: "Semifinals", phase: "playoff", mode: "scheduled", date: "2026-10-22", pairing: "winners", start });
const fin = (start?: string) => ({ name: "Final", phase: "playoff", mode: "scheduled", date: "2026-10-26", pairing: "winners", start });
const K = "Mens::1st";
const st = (plan: any, active: number, opened?: string[]) => {
  const m = milestoneFor(plan, K);
  return koRoundState({ active, nextRound: 5, milestone: m, steps: playoffSteps(plan, K), today: "2026-10-03", opened: opened ? new Set(opened) : undefined,
    plan: pacePlan({ active, target: active > m.fieldSize! ? m.fieldSize : null, roundsLeft: 1, pace: "paced" }) });
};
const f4 = [3, 1, 4, 2].map((r) => ({ id: `p${r}`, rank: r }));

describe("formal play-off handoff", () => {
  it("auto Semifinals open on readiness, not the date", () => {
    expect(st({ stages: [...rounds, sf("auto"), fin("auto")] }, 4)).toEqual({ kind: "playoff", label: "Semifinals", count: 2 });
  });
  it("wait-for-organiser stays closed until opened", () => {
    const plan = { stages: [...rounds, sf("confirm"), fin("auto")] };
    expect(st(plan, 4)).toMatchObject({ kind: "waiting_for_stage", needsOrganiser: true, date: "2026-10-22" });
    expect(st(plan, 4, ["Semifinals"])).toMatchObject({ kind: "playoff", label: "Semifinals" });
  });
  it("seeded 1v4, 2v3 from the qualified field", () => {
    const p = playoffPairings(f4, 2, "winners", null);
    expect(p.pairs.map(([a, b]) => `${a.id}v${b.id}`)).toEqual(["p1vp4", "p2vp3"]);
    expect(p.rule).toContain("1 v 4, 2 v 3");
  });
  it("Final proposed only from actual SF winners in bracket order", () => {
    const sfRows = [
      { round_number: 5, bracket_position: 1, player_a_member_id: "p1", player_b_member_id: "p4", winner_member_id: "p4", status: "completed", stage_label: "Semifinals" },
      { round_number: 5, bracket_position: 2, player_a_member_id: "p2", player_b_member_id: "p3", winner_member_id: "p2", status: "completed", stage_label: "Semifinals" },
    ];
    const f = activeField(f4, sfRows as any);
    expect(f.active.map((e) => e.id).sort()).toEqual(["p2", "p4"]);
    expect(st({ stages: [...rounds, sf("auto"), fin("auto")] }, 2)).toEqual({ kind: "playoff", label: "Final", count: 1 });
    const p = playoffPairings(f.active, 1, "winners", sfRows);
    expect(p.pairs.map(([a, b]) => `${a.id}v${b.id}`)).toEqual(["p4vp2"]);
  });
  it("still over the field stays in pre-play-off rounds", () => {
    expect(st({ stages: [...rounds, sf("auto"), fin("auto")] }, 5).kind).toBe("pre_round");
  });
});
