import { describe, expect, it } from "vitest";
import {
  bracketSizeForActive,
  byesForActive,
  divisionEliminations,
  divisionPools,
  isEliminatedInDivision,
  labelForActive,
  typeForActive,
} from "@/lib/tournaments/active-draw";
import { buildSectionFirstRound, buildNextRound, type KnockoutSeed } from "@/lib/tournaments/knockout";
import { sectionProgression, generateActionLabel } from "@/lib/tournaments/knockout-progression";

const seeds = (n: number, p = "m"): KnockoutSeed[] =>
  Array.from({ length: n }, (_, i) => ({ memberId: `${p}${i + 1}`, seed: i + 1 }));

const round = (n: number, section = 1, group = 1, prefix = "m") =>
  buildSectionFirstRound({ champId: "c1", groupNumber: group, section, seeds: seeds(n, prefix) }).map((r) => ({
    ...r,
    group_number: group,
    section_number: section,
  }));

const play = (rows: any[], winA = true) =>
  rows.map((r) =>
    r.is_bye ? r : { ...r, status: "completed", winner_member_id: winA ? r.player_a_member_id : r.player_b_member_id },
  );

describe("progression driven by active entrants", () => {
  it("names the stage from how many are left, not the match count", () => {
    expect(labelForActive(2)).toBe("Final");
    expect(labelForActive(3)).toBe("Semi-final");
    expect(labelForActive(4)).toBe("Semi-final");
    expect(labelForActive(5)).toBe("Quarter-final");
    expect(labelForActive(8)).toBe("Quarter-final");
    expect(labelForActive(12)).toBe("Round of 16");
    expect(typeForActive(2)).toBe("final");
    expect(typeForActive(3)).toBe("semi_final");
    expect(typeForActive(6)).toBe("knockout");
  });

  it("adds byes for non power-of-two fields", () => {
    expect(bracketSizeForActive(3)).toBe(4);
    expect(byesForActive(3)).toBe(1);
    expect(byesForActive(5)).toBe(3);
    expect(byesForActive(4)).toBe(0);
  });

  it("2 remaining ⇒ final", () => {
    const r1 = play(round(4));
    const r2 = buildNextRound({ champId: "c1", groupNumber: 1, section: 1, roundMatches: r1 }).map((r) => ({
      ...r,
      group_number: 1,
      section_number: 1,
    }));
    const [s] = sectionProgression(play(r2));
    expect(s.activeCount).toBe(1);
    expect(s.complete).toBe(true);
    const [pre] = sectionProgression(r1);
    expect(pre.activeCount).toBe(2);
    expect(pre.nextRound?.label).toBe("Final");
  });

  it("4 remaining ⇒ semi-finals then final", () => {
    const [s] = sectionProgression(play(round(8)));
    expect(s.activeCount).toBe(4);
    expect(s.nextRound?.label).toBe("Semi-final");
    expect(generateActionLabel(s)).toBe("Generate Semi-finals");
  });

  it("3 remaining ⇒ semi-final with a bye, never a bogus label", () => {
    const rows = round(5); // 5 entrants → byes in round 1
    const r1 = rows.map((r) => (r.is_bye ? r : { ...r, status: "completed", winner_member_id: r.player_a_member_id }));
    const [s] = sectionProgression(r1);
    expect(s.activeCount).toBeGreaterThanOrEqual(3);
    expect(["Semi-final", "Quarter-final"]).toContain(s.nextRound?.label);
  });

  it("uses a neutral label for a normal knockout round", () => {
    const [s] = sectionProgression(play(round(16)));
    expect(s.activeCount).toBe(8);
    expect(generateActionLabel(s)).toBe("Generate Next Round");
  });
});

describe("elimination is scoped to the division", () => {
  const div1 = play(round(4, 1, 1));
  const div2 = round(4, 1, 2); // same members, other division, unplayed
  const both = [...div1, ...div2.map((r) => ({ ...r }))];

  it("marks losers out of the division they lost in", () => {
    const elim = divisionEliminations(both, 1);
    expect([...elim.keys()].sort()).toEqual(["m3", "m4"]);
    expect(elim.get("m3")!.round).toBe(1);
  });

  it("keeps the same player active in another division", () => {
    expect(isEliminatedInDivision(both, 1, "m3")).toBe(true);
    expect(isEliminatedInDivision(both, 2, "m3")).toBe(false);
  });

  it("never eliminates through a bye or an unplayed match", () => {
    expect(divisionEliminations(round(5), 1).size).toBe(0);
    expect(divisionEliminations(round(4), 1).size).toBe(0);
  });
});

describe("pools inside a division", () => {
  const rows = [...play(round(4, 1)), ...round(4, 2)];

  it("splits a division into its pools", () => {
    const pools = divisionPools(rows, 1);
    expect(pools.map((p) => p.letter)).toEqual(["A", "B"]);
    expect(pools[0].entrantIds).toHaveLength(4);
  });

  it("shows completion and qualifiers only when the pool is decided", () => {
    const [a, b] = divisionPools(rows, 1);
    expect(a.complete).toBe(true);
    expect(a.activeIds.sort()).toEqual(["m1", "m2"]);
    expect(a.qualifierIds.sort()).toEqual(["m1", "m2"]);
    expect(b.complete).toBe(false);
    expect(b.qualifierIds).toEqual([]);
    expect(b.activeIds).toHaveLength(4);
  });

  it("retains eliminated entrants in history, out of the active list", () => {
    const [a] = divisionPools(rows, 1);
    expect(a.entrantIds).toHaveLength(4);
    expect(a.eliminated.map((e) => e.memberId).sort()).toEqual(["m3", "m4"]);
    expect(a.matchesDone).toBe(2);
  });
});
