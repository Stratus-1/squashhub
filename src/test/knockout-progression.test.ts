import { describe, expect, it } from "vitest";
import {
  advancingMembers,
  entrantStates,
  generateActionLabel,
  progressSummary,
  requiredRoundCount,
  sectionProgression,
  suggestRoundPlan,
  validateRoundPlan,
  type ChampRound,
} from "@/lib/tournaments/knockout-progression";
import { buildNextRound, buildSectionFirstRound, type KnockoutSeed } from "@/lib/tournaments/knockout";

const seeds = (n: number): KnockoutSeed[] =>
  Array.from({ length: n }, (_, i) => ({ memberId: `m${i + 1}`, seed: i + 1 }));

const play = (rows: any[], pickA = true) =>
  rows.map((r) =>
    r.is_bye
      ? r
      : { ...r, status: "completed", winner_member_id: pickA ? r.player_a_member_id : r.player_b_member_id },
  );

const firstRound = (n: number, section = 1) =>
  buildSectionFirstRound({ champId: "c1", groupNumber: 1, section, seeds: seeds(n) }).map((r) => ({ ...r }));

describe("round plans", () => {
  it("suggests one round per bracket level ending semi-final → final", () => {
    expect(suggestRoundPlan(4).map((r) => r.label)).toEqual(["Round 1", "Round 2"]);
    expect(suggestRoundPlan(8).map((r) => r.label)).toEqual(["Round 1", "Round 2", "Round 3"]);
    expect(suggestRoundPlan(16).map((r) => r.label)).toEqual([
      "Round of 16",
      "Quarter-final",
      "Semi-final",
      "Final",
    ]);
  });

  it("supports 1, 2 and 3 knockout rounds before the semi-final", () => {
    expect(requiredRoundCount(8)).toBe(3); // R1 → SF → F
    expect(requiredRoundCount(16)).toBe(4); // R1 → R2 → SF → F
    expect(requiredRoundCount(32)).toBe(5); // R1 → R2 → R3 → SF → F
    expect(suggestRoundPlan(32).map((r) => r.round_type)).toEqual([
      "knockout",
      "knockout",
      "knockout",
      "semi_final",
      "final",
    ]);
  });

  it("rejects a plan that does not match the bracket depth", () => {
    const short = suggestRoundPlan(16).slice(0, 3);
    expect(validateRoundPlan(short, 16).join(" ")).toContain("exactly 4 rounds");
    expect(validateRoundPlan(suggestRoundPlan(16), 16)).toEqual([]);
  });

  it("requires the last two rounds to be semi-final and final", () => {
    const plan = suggestRoundPlan(8);
    plan[2] = { ...plan[2], round_type: "knockout" };
    expect(validateRoundPlan(plan, 8).join(" ")).toContain("final");
  });
});

describe("entrant state", () => {
  it("marks the loser eliminated in the round they lost", () => {
    const r1 = play(firstRound(4));
    const states = entrantStates(r1);
    const out = states.filter((s) => s.eliminated).map((s) => s.memberId).sort();
    expect(out).toEqual(["m3", "m4"]);
    expect(states.find((s) => s.memberId === "m3")!.eliminatedInRound).toBe(1);
    expect(states.find((s) => s.memberId === "m1")!.eliminated).toBe(false);
  });

  it("never eliminates anyone through a bye", () => {
    const r1 = firstRound(5);
    expect(r1.some((r) => r.is_bye)).toBe(true);
    const states = entrantStates(r1);
    expect(states.every((s) => !s.eliminated)).toBe(true);
  });

  it("leaves both sides alive while a match is unplayed", () => {
    const states = entrantStates(firstRound(4));
    expect(states.filter((s) => s.eliminated)).toHaveLength(0);
    expect(states).toHaveLength(4);
  });

  it("keeps every entrant historically visible after later rounds", () => {
    const r1 = play(firstRound(8));
    const r2 = play(buildNextRound({ champId: "c1", groupNumber: 1, section: 1, roundMatches: r1 }).map((r) => ({ ...r })));
    const states = entrantStates([...r1, ...r2]);
    expect(states).toHaveLength(8);
    expect(states.filter((s) => s.eliminated)).toHaveLength(6);
  });
});

describe("section progression", () => {
  const plan8: ChampRound[] = suggestRoundPlan(8, { groupNumber: 1, sectionNumber: 1 });

  it("blocks generation while matches are unresolved", () => {
    const [s] = sectionProgression(firstRound(8), plan8);
    expect(s.canGenerateNext).toBe(false);
    expect(s.blockedReason).toContain("still to be played");
    expect(s.total).toBe(4);
    expect(s.completed).toBe(0);
  });

  it("offers only the configured next stage once the round is complete", () => {
    const [s] = sectionProgression(play(firstRound(8)), plan8);
    expect(s.canGenerateNext).toBe(true);
    expect(s.nextRound?.label).toBe("Round 2");
    expect(generateActionLabel(s)).toBe("Generate Next Round");
    expect(progressSummary(s)).toContain("Next: Round 2");
    expect(advancingMembers(s)).toEqual(["m1", "m4", "m2", "m3"]);
  });

  it("does not generate the same round twice", () => {
    const r1 = play(firstRound(8));
    const r2 = buildNextRound({ champId: "c1", groupNumber: 1, section: 1, roundMatches: r1 }).map((r) => ({ ...r }));
    const [s] = sectionProgression([...r1, ...r2], plan8);
    expect(s.currentRound).toBe(2);
    expect(sectionProgression([...r1, ...r2], plan8)[0].nextRoundGenerated).toBe(false);
    const back = sectionProgression([...r1, ...r2].map((m) => ({ ...m })), plan8)[0];
    expect(back.canGenerateNext).toBe(false); // semis unplayed
    expect(back.blockedReason).toContain("still to be played");
  });

  it("reports a decided section and never offers another round", () => {
    const r1 = play(firstRound(2));
    const [s] = sectionProgression(r1, suggestRoundPlan(2));
    expect(s.complete).toBe(true);
    expect(s.winner).toBe("m1");
    expect(s.canGenerateNext).toBe(false);
    expect(s.blockedReason).toBe("This section is decided.");
  });

  it("handles uneven brackets with byes", () => {
    const r1 = firstRound(5).map((r) => (r.is_bye ? r : { ...r, status: "completed", winner_member_id: r.player_b_member_id }));
    const [s] = sectionProgression(r1, suggestRoundPlan(5));
    expect(s.currentRoundComplete).toBe(true);
    expect(s.canGenerateNext).toBe(true);
    expect(advancingMembers(s)).toHaveLength(4);
  });

  it("keeps sections independent", () => {
    const rows = [...play(firstRound(4, 1)), ...firstRound(4, 2)];
    const states = sectionProgression(rows, [
      ...suggestRoundPlan(4, { sectionNumber: 1 }),
      ...suggestRoundPlan(4, { sectionNumber: 2 }),
    ]);
    expect(states).toHaveLength(2);
    expect(states[0].canGenerateNext).toBe(true);
    expect(states[1].canGenerateNext).toBe(false);
  });

  it("uses a neutral round name when no plan is stored", () => {
    const [s] = sectionProgression(play(firstRound(8)));
    expect(s.nextRound?.label).toBe("Round 2");
    expect(s.canGenerateNext).toBe(true);
  });

  it("ignores non-knockout matches", () => {
    expect(sectionProgression([{ stage: "group", group_number: 1 } as any])).toEqual([]);
  });
});
