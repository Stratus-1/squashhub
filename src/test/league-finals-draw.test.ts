import { describe, expect, it } from "vitest";
import {
  finalsReady,
  finalsRoundNumber,
  leagueFinalsEntrants,
  suggestLeagueFinalsBoard,
} from "@/lib/tournaments/league-finals-draw";
import type { SectionProgression } from "@/lib/tournaments/knockout-progression";

const pool = (
  section: number,
  winner: string | null,
  complete: boolean,
  round = 2,
  partner: string | null = null,
): SectionProgression =>
  ({
    groupNumber: 3,
    section,
    plan: [],
    currentRound: round,
    currentRoundMatches: [
      {
        id: `m${section}`,
        round_number: round,
        bracket_position: 1,
        player_a_member_id: winner,
        partner_a_member_id: partner,
        player_b_member_id: "loser",
        winner_member_id: winner,
        status: "completed",
      },
    ] as any,
    completed: 1,
    total: 1,
    currentRoundComplete: complete,
    unresolved: [],
    nextRound: null,
    nextRoundGenerated: false,
    canGenerateNext: false,
    blockedReason: null,
    complete,
    winner,
    activeCount: 1,
    entrants: [],
  }) as SectionProgression;

/** The division's play-off bracket (section 0) with explicit entrant states. */
const playoff = (
  entrants: Array<[string, boolean]>,
  round = 5,
  currentRoundComplete = true,
): SectionProgression =>
  ({
    ...pool(0, null, false, round),
    section: 0,
    entrants: entrants.map(([memberId, eliminated]) => ({ memberId, eliminated })) as any,
    currentRoundComplete,
    complete: false,
    winner: null,
  }) as SectionProgression;

describe("league play-off survivors", () => {
  it("drops a pool winner who lost in the play-off", () => {
    const sections = [
      pool(1, "a", true),
      pool(2, "b", true),
      pool(3, "c", true),
      playoff([
        ["a", false],
        ["b", true],
      ]),
    ];
    expect(leagueSurvivors(sections).sort()).toEqual(["a", "c"]);
    expect(leagueSurvivorCount(sections)).toBe(2);
  });

  it("offers the next play-off round while two are still standing", () => {
    const sections = [
      pool(1, "a", true),
      pool(2, "b", true),
      pool(3, "c", true),
      playoff([
        ["a", false],
        ["b", true],
      ]),
    ];
    expect(finalsReady(sections)).toBe(true);
  });

  it("waits while the play-off round is still being played", () => {
    const sections = [
      pool(1, "a", true),
      pool(2, "b", true),
      pool(3, "c", true),
      playoff(
        [
          ["a", false],
          ["b", false],
        ],
        5,
        false,
      ),
    ];
    expect(finalsReady(sections)).toBe(false);
  });

  it("is over once one player is left", () => {
    const sections = [
      pool(1, "a", true),
      pool(2, "b", true),
      playoff([
        ["a", false],
        ["b", true],
      ]),
    ];
    expect(leagueSurvivorCount(sections)).toBe(1);
    expect(finalsReady(sections)).toBe(false);
  });
});

describe("league finals draw", () => {
  it("is not ready until every pool is decided", () => {
    expect(finalsReady([pool(1, "a", true), pool(2, "b", false)])).toBe(false);
    expect(finalsReady([pool(1, "a", true), pool(2, "b", true)])).toBe(true);
  });

  it("needs at least two pools", () => {
    expect(finalsReady([pool(1, "a", true)])).toBe(false);
  });

  it("places the finals one round after the deepest pool", () => {
    expect(finalsRoundNumber([pool(1, "a", true, 2), pool(2, "b", true, 4)])).toBe(5);
  });

  it("makes one entrant per pool winner, carrying the partner", () => {
    const e = leagueFinalsEntrants([pool(1, "a", true, 2, "p1"), pool(2, "b", true)], (id) => id.toUpperCase());
    expect(e.map((x) => x.id)).toEqual(["a", "b"]);
    expect(e[0].partnerId).toBe("p1");
    expect(e[0].name).toBe("A");
    expect(e[0].rankLabel).toBe("Pool A winner");
  });

  it("suggests the default pairing in section 0, third winner gets the bye", () => {
    const winners = leagueFinalsEntrants([
      pool(1, "a", true),
      pool(2, "b", true),
      pool(3, "c", true),
    ]);
    const board = suggestLeagueFinalsBoard({ groupNumber: 3, round: 5, winners });
    expect(board.matches).toHaveLength(2);
    expect(board.matches.every((m) => m.section === 0)).toBe(true);
    expect(board.matches[0]).toMatchObject({ a: "a", b: "b" });
    expect(board.matches[1]).toMatchObject({ a: "c", b: null });
  });
});
