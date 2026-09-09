import { describe, it, expect } from "vitest";
import { qualifierEntrants, strandedAliveIds } from "../round-draw";
import { readyNextRoundScopes } from "../next-round-setup";

const m = (over: Partial<any> = {}) => ({
  id: "m",
  stage: "ko",
  status: "completed",
  round_number: 3,
  bracket_position: 1,
  is_bye: false,
  ...over,
});

/** Josh won rounds 1-2, then an organiser correction took him out of round 3. */
const section = {
  groupNumber: 1,
  section: 1,
  plan: [],
  currentRound: 3,
  currentRoundMatches: [
    m({ id: "r3", player_a_member_id: "matt", player_b_member_id: "sam", winner_member_id: "sam" }),
  ],
  completed: 1,
  total: 1,
  currentRoundComplete: true,
  unresolved: [],
  nextRound: { group_number: 1, section_number: 1, round_number: 4, round_type: "final" as const },
  nextRoundGenerated: false,
  canGenerateNext: true,
  blockedReason: null,
  complete: false,
  winner: null,
  activeCount: 2,
  entrants: [
    { memberId: "josh", aliveInRound: 2, eliminatedInRound: null, eliminated: false },
    { memberId: "sam", aliveInRound: 3, eliminatedInRound: null, eliminated: false },
    { memberId: "matt", aliveInRound: null, eliminatedInRound: 3, eliminated: true },
  ],
} as any;

describe("players still alive but not in the last round", () => {
  it("lists the replaced-out player as stranded", () => {
    expect(strandedAliveIds(section)).toEqual(["josh"]);
  });

  it("offers them on the next-round draw board", () => {
    const ids = qualifierEntrants(section, (id) => id).map((e) => e.id);
    expect(ids).toEqual(["sam", "josh"]);
  });

  it("counts them as qualifiers for the round scope", () => {
    const scope = readyNextRoundScopes([section])[0];
    expect(scope.qualifierIds.sort()).toEqual(["josh", "sam"]);
    expect(scope.matchups).toBe(1);
  });

  it("never offers an eliminated player", () => {
    expect(strandedAliveIds(section)).not.toContain("matt");
  });
});
