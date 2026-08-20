import { describe, expect, it } from "vitest";
import {
  bracketSizeFor,
  buildLeagueFinals,
  buildLeagueFirstRound,
  buildNextRound,
  buildSectionFirstRound,
  distributeSeedsBalanced,
  knockoutMatchCount,
  knockoutState,
  roundLabel,
  roundsFor,
  sectionLetter,
  seedSlotOrder,
  suggestSectionCount,
  winnerOf,
  type KnockoutSeed,
} from "@/lib/tournaments/knockout";

const seeds = (n: number): KnockoutSeed[] =>
  Array.from({ length: n }, (_, i) => ({ memberId: `m${i + 1}`, seed: i + 1 }));

describe("bracket maths", () => {
  it("rounds up to the next power of two", () => {
    expect(bracketSizeFor(2)).toBe(2);
    expect(bracketSizeFor(5)).toBe(8);
    expect(bracketSizeFor(8)).toBe(8);
    expect(bracketSizeFor(9)).toBe(16);
  });

  it("counts rounds", () => {
    expect(roundsFor(1)).toBe(0);
    expect(roundsFor(5)).toBe(3);
    expect(roundsFor(16)).toBe(4);
  });

  it("labels rounds", () => {
    expect(roundLabel(2)).toBe("Final");
    expect(roundLabel(4)).toBe("Semi-final");
    expect(roundLabel(8)).toBe("Quarter-final");
    expect(roundLabel(16)).toBe("Round of 16");
  });

  it("orders slots so 1 and 2 meet only in the final", () => {
    expect(seedSlotOrder(2)).toEqual([1, 2]);
    expect(seedSlotOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedSlotOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("suggests sensible section counts", () => {
    expect(suggestSectionCount(6)).toBe(1);
    expect(suggestSectionCount(14)).toBe(2);
    expect(suggestSectionCount(30)).toBe(4);
    expect(suggestSectionCount(40)).toBe(8);
  });

  it("names sections", () => {
    expect(sectionLetter(1)).toBe("A");
    expect(sectionLetter(3)).toBe("C");
  });
});

describe("balanced seeding", () => {
  it("snakes seeds across sections", () => {
    const out = distributeSeedsBalanced(seeds(8), 2);
    expect(out.map((s) => s.seeds.map((x) => x.seed))).toEqual([
      [1, 4, 5, 8],
      [2, 3, 6, 7],
    ]);
  });

  it("handles uneven counts", () => {
    const out = distributeSeedsBalanced(seeds(7), 3);
    expect(out[0].seeds.map((s) => s.seed)).toEqual([1, 6, 7]);
    expect(out.reduce((n, s) => n + s.seeds.length, 0)).toBe(7);
  });

  it("is stable when there is only one section", () => {
    const out = distributeSeedsBalanced(seeds(5), 1);
    expect(out).toHaveLength(1);
    expect(out[0].seeds.map((s) => s.seed)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("first round", () => {
  it("gives byes to the top seeds", () => {
    const rows = buildSectionFirstRound({ champId: "c1", groupNumber: 1, section: 1, seeds: seeds(5) });
    expect(rows).toHaveLength(4);
    const byes = rows.filter((r) => r.is_bye);
    expect(byes).toHaveLength(3);
    expect(byes.every((b) => b.status === "completed" && b.winner_member_id)).toBe(true);
    // Seed 1 gets a bye, seeds 4 and 5 play each other.
    expect(rows[0].bye_member_id).toBe("m1");
    const real = rows.find((r) => !r.is_bye)!;
    expect([real.player_a_member_id, real.player_b_member_id].sort()).toEqual(["m4", "m5"]);
  });

  it("produces no rows for a section of one", () => {
    expect(buildSectionFirstRound({ champId: "c1", groupNumber: 1, section: 1, seeds: seeds(1) })).toEqual([]);
  });

  it("labels sections only when a league has more than one", () => {
    const one = buildLeagueFirstRound({
      champId: "c1",
      groupNumber: 1,
      assignments: distributeSeedsBalanced(seeds(4), 1),
    });
    expect(one[0].stage_label).toBe("Semi-final");
    const two = buildLeagueFirstRound({
      champId: "c1",
      groupNumber: 1,
      assignments: distributeSeedsBalanced(seeds(8), 2),
    });
    expect(two[0].stage_label).toBe("Section A · Semi-final");
    expect(two.some((r) => r.section_number === 2)).toBe(true);
  });
});

describe("progression", () => {
  const complete = (rows: any[], winners: string[]) =>
    rows.map((r, i) => (r.is_bye ? r : { ...r, status: "completed", winner_member_id: winners[i] }));

  it("waits for the round to finish", () => {
    const r1 = buildSectionFirstRound({ champId: "c1", groupNumber: 1, section: 1, seeds: seeds(4) });
    expect(buildNextRound({ champId: "c1", groupNumber: 1, section: 1, roundMatches: r1 })).toEqual([]);
  });

  it("pairs winners in bracket order", () => {
    const r1 = buildSectionFirstRound({ champId: "c1", groupNumber: 1, section: 1, seeds: seeds(4) });
    const done = complete(r1, ["m1", "m2"]);
    const r2 = buildNextRound({ champId: "c1", groupNumber: 1, section: 1, roundMatches: done });
    expect(r2).toHaveLength(1);
    expect(r2[0].round_number).toBe(2);
    expect(r2[0].stage_label).toBe("Final");
    expect([r2[0].player_a_member_id, r2[0].player_b_member_id]).toEqual(["m1", "m2"]);
  });

  it("carries byes through", () => {
    const r1 = buildSectionFirstRound({ champId: "c1", groupNumber: 1, section: 1, seeds: seeds(5) });
    const done = r1.map((r) => (r.is_bye ? r : { ...r, status: "completed", winner_member_id: "m4" }));
    const r2 = buildNextRound({ champId: "c1", groupNumber: 1, section: 1, roundMatches: done });
    expect(r2).toHaveLength(2);
    expect(r2.every((m) => m.player_a_member_id && m.player_b_member_id)).toBe(true);
  });

  it("stops at the final", () => {
    const finalRow = [
      {
        round_number: 2,
        bracket_position: 1,
        status: "completed",
        winner_member_id: "m1",
        player_a_member_id: "m1",
        player_b_member_id: "m2",
      },
    ];
    expect(buildNextRound({ champId: "c1", groupNumber: 1, section: 1, roundMatches: finalRow })).toEqual([]);
  });

  it("resolves winners from points when no explicit winner is set", () => {
    expect(
      winnerOf({ status: "completed", side_a_points: 3, side_b_points: 1, player_a_member_id: "a", player_b_member_id: "b" }),
    ).toBe("a");
    expect(
      winnerOf({ status: "completed", side_a_points: 1, side_b_points: 1, player_a_member_id: "a", player_b_member_id: "b" }),
    ).toBeNull();
    expect(winnerOf({ status: "scheduled", player_a_member_id: "a" })).toBeNull();
  });
});

describe("state reporting", () => {
  it("reports per-section progress", () => {
    const rows = buildLeagueFirstRound({
      champId: "c1",
      groupNumber: 1,
      assignments: distributeSeedsBalanced(seeds(8), 2),
    }).map((r) => ({ ...r }));
    let state = knockoutState(rows);
    expect(state).toHaveLength(2);
    expect(state[0].latestRound).toBe(1);
    expect(state[0].roundComplete).toBe(false);
    expect(state[0].canGenerateNext).toBe(false);

    const done = rows.map((r) => ({ ...r, status: "completed", winner_member_id: r.player_a_member_id }));
    state = knockoutState(done);
    expect(state[0].roundComplete).toBe(true);
    expect(state[0].canGenerateNext).toBe(true);
    expect(state[0].sectionComplete).toBe(false);
  });

  it("detects a decided section", () => {
    const rows = [
      {
        stage: "ko",
        group_number: 1,
        section_number: 1,
        round_number: 2,
        bracket_position: 1,
        status: "completed",
        winner_member_id: "m1",
      },
    ];
    const [state] = knockoutState(rows);
    expect(state.sectionComplete).toBe(true);
    expect(state.sectionWinner).toBe("m1");
    expect(state.canGenerateNext).toBe(false);
  });

  it("ignores non-knockout matches", () => {
    expect(knockoutState([{ stage: "group", group_number: 1 }])).toEqual([]);
  });
});

describe("league finals", () => {
  it("pits section winners against each other", () => {
    const rows = buildLeagueFinals({
      champId: "c1",
      groupNumber: 1,
      round: 4,
      sectionWinners: [
        { section: 1, memberId: "m1" },
        { section: 2, memberId: "m2" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].round_number).toBe(4);
    expect(rows[0].section_number).toBe(0);
    expect(rows[0].stage_label).toContain("League finals");
  });

  it("needs at least two section winners", () => {
    expect(
      buildLeagueFinals({ champId: "c1", groupNumber: 1, round: 3, sectionWinners: [{ section: 1, memberId: "m1" }] }),
    ).toEqual([]);
  });
});

describe("capacity", () => {
  it("counts n-1 matches per section plus the finals bracket", () => {
    expect(knockoutMatchCount(distributeSeedsBalanced(seeds(8), 1))).toBe(7);
    expect(knockoutMatchCount(distributeSeedsBalanced(seeds(8), 2))).toBe(3 + 3 + 1);
  });
});
