import { describe, it, expect } from "vitest";
import {
  addRoundDefinition,
  appendRoundDefinition,
  centralDateImpact,
  fromLegacyDeadlines,
  hasDefinition,
  leagueStageName,
  nextRoundReference,
  parseMilestones,
  parseRoundDefinitions,
  patchRoundDefinition,
  resolvePlayBy,
  serializeRoundDefinitions,
  stageForAlive,
  validateMilestones,
  validateRoundDefinitions,
} from "@/lib/tournaments/round-definitions";

const defs = [
  { round: 1, label: "Round 1", play_by: "2026-08-29" },
  { round: 2, label: "Round 2", play_by: "2026-09-05" },
  { round: 3, label: "Round 3", play_by: "2026-09-12" },
];
const milestones = { quarter_final: "2026-09-17", semi_final: "2026-09-20", final: "2026-09-22" };

describe("league stage comes from survivors, never from the round number", () => {
  it("names the stage from how many players are still in", () => {
    expect(stageForAlive(2)).toBe("final");
    expect(stageForAlive(3)).toBe("semi_final");
    expect(stageForAlive(4)).toBe("semi_final");
    expect(stageForAlive(5)).toBe("quarter_final");
    expect(stageForAlive(8)).toBe("quarter_final");
    expect(stageForAlive(9)).toBe("early");
    expect(stageForAlive(20)).toBe("early");
  });

  it("treats three pools with 1, 1 and 2 left as a league semi-final", () => {
    expect(stageForAlive(1 + 1 + 2)).toBe("semi_final");
  });

  it("never calls a pool round a final while the league still has more players", () => {
    expect(leagueStageName("semi_final", { leagueLabel: "2nd League", sectionLabel: "Section A" })).toBe(
      "2nd League Semi-final",
    );
    expect(leagueStageName("early", { roundNumber: 2, sectionLabel: "Section A" })).toBe(
      "Round 2 · Section A",
    );
  });
});

describe("one resolution order for every play-by date", () => {
  it("uses the milestone date once a league reaches a milestone", () => {
    const r = resolvePlayBy({ stage: "final", roundNumber: 5, definitions: defs, milestones });
    expect(r.date).toBe("2026-09-22");
    expect(r.source).toBe("milestone");
  });

  it("uses the central round date for an early round", () => {
    const r = resolvePlayBy({ stage: "early", roundNumber: 2, definitions: defs, milestones });
    expect(r.date).toBe("2026-09-05");
    expect(r.source).toBe("definition");
  });

  it("lets a deliberate league or fixture exception win", () => {
    expect(
      resolvePlayBy({ stage: "final", roundNumber: 5, definitions: defs, milestones, roundOverride: "2026-09-25" })
        .source,
    ).toBe("round_override");
    expect(
      resolvePlayBy({
        stage: "final",
        roundNumber: 5,
        definitions: defs,
        milestones,
        roundOverride: "2026-09-25",
        matchOverride: "2026-09-26",
      }).date,
    ).toBe("2026-09-26");
  });

  it("gives two leagues on the same round number different dates when their stages differ", () => {
    const big = resolvePlayBy({ stage: "early", roundNumber: 6, definitions: [...defs, { round: 6, label: "Round 6", play_by: "2026-09-16" }], milestones });
    const small = resolvePlayBy({ stage: "final", roundNumber: 6, definitions: defs, milestones });
    expect(big.date).toBe("2026-09-16");
    expect(small.date).toBe("2026-09-22");
  });

  it("gives a league that reaches its final early the common final date", () => {
    const early = resolvePlayBy({ stage: "final", roundNumber: 2, definitions: defs, milestones });
    expect(early.date).toBe("2026-09-22");
  });

  it("reports no date rather than guessing one", () => {
    expect(resolvePlayBy({ stage: "early", roundNumber: 9, definitions: defs, milestones }).date).toBeNull();
  });
});

describe("progressing a league references the central definition", () => {
  it("names the central round and date without creating anything", () => {
    const ref = nextRoundReference({ alive: 12, roundNumber: 3, definitions: defs, milestones, leagueLabel: "2nd League" });
    expect(ref.needsDefinition).toBe(false);
    expect(ref.stage).toBe("early");
    expect(ref.playBy).toBe("2026-09-12");
    expect(ref.headline).toContain("Progress 2nd League to Round 3");
  });

  it("blocks and prompts when the next early round is not centrally defined", () => {
    const ref = nextRoundReference({ alive: 12, roundNumber: 7, definitions: defs, milestones });
    expect(ref.needsDefinition).toBe(true);
    expect(ref.playBy).toBeNull();
    expect(ref.headline).toMatch(/not defined/);
  });

  it("never asks for a definition at a milestone stage", () => {
    const ref = nextRoundReference({ alive: 4, roundNumber: 7, definitions: defs, milestones, leagueLabel: "3rd League" });
    expect(ref.needsDefinition).toBe(false);
    expect(ref.stage).toBe("semi_final");
    expect(ref.playBy).toBe("2026-09-20");
  });

  it("lets a central round exist that only the biggest league uses", () => {
    const withSix = addRoundDefinition(defs, 6, { play_by: "2026-09-16" });
    expect(hasDefinition(withSix, 6)).toBe(true);
    // A small league at its final ignores round 6 entirely.
    expect(nextRoundReference({ alive: 2, roundNumber: 4, definitions: withSix, milestones }).stage).toBe("final");
  });
});

describe("the central list itself", () => {
  it("reads the legacy positional plan", () => {
    expect(fromLegacyDeadlines([{ label: "Round 1", date: "2026-08-29" }, { label: "Round 2", date: "2026-09-05" }])).toEqual([
      { round: 1, label: "Round 1", play_by: "2026-08-29", notes: null },
      { round: 2, label: "Round 2", play_by: "2026-09-05", notes: null },
    ]);
    expect(parseRoundDefinitions(["2026-08-29", "2026-09-05"]).map((d) => d.play_by)).toEqual([
      "2026-08-29",
      "2026-09-05",
    ]);
  });

  it("keeps one row per round and adds without duplicating", () => {
    const twice = addRoundDefinition(addRoundDefinition(defs, 4, { play_by: "2026-09-14" }), 4, {
      play_by: "2026-09-30",
    });
    expect(twice.filter((d) => d.round === 4)).toHaveLength(1);
    expect(twice.find((d) => d.round === 4)?.play_by).toBe("2026-09-14");
    expect(appendRoundDefinition(defs).map((d) => d.round)).toEqual([1, 2, 3, 4]);
  });

  it("edits an existing round in place", () => {
    const patched = patchRoundDefinition(defs, 2, { play_by: "2026-09-07" });
    expect(patched.find((d) => d.round === 2)?.play_by).toBe("2026-09-07");
    expect(serializeRoundDefinitions(patched)).toHaveLength(3);
  });

  it("catches out-of-order and missing dates", () => {
    expect(validateRoundDefinitions(defs)).toEqual([]);
    expect(
      validateRoundDefinitions([
        { round: 1, label: "Round 1", play_by: "2026-09-10" },
        { round: 2, label: "Round 2", play_by: "2026-09-01" },
      ]),
    ).toContain("Round 2 is due before Round 1.");
  });

  it("requires and orders the championship milestones", () => {
    expect(parseMilestones(milestones).final).toBe("2026-09-22");
    expect(validateMilestones(milestones, { require: true })).toEqual([]);
    expect(validateMilestones({}, { require: true })).toHaveLength(3);
    expect(
      validateMilestones({ quarter_final: "2026-09-20", semi_final: "2026-09-17" }),
    ).toContain("The semi-final is due before the quarter-final.");
  });
});

describe("editing a central date protects history", () => {
  it("counts what would move and what stays put", () => {
    const impact = centralDateImpact(
      [
        { round_number: 2, status: "completed" },
        { round_number: 2, status: "scheduled" },
        { round_number: 2, status: "scheduled", court_id: 3 },
        { round_number: 3, status: "scheduled" },
      ],
      2,
    );
    expect(impact.affected).toBe(1);
    expect(impact.protected).toBe(2);
  });
});
