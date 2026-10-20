import { describe, expect, it } from "vitest";
import { resolveChallengeTarget } from "@/lib/ladder/challenge-navigation";
import { DEFAULT_LADDER_CONFIG, evaluateChallenge } from "@/lib/ladder/eligibility";

describe("profile challenge target", () => {
  const players = [
    { id: "first", club_member_id: "first", user_id: "shared" },
    { id: "second", club_member_id: "second", user_id: "shared" },
  ];
  it("selects the specific member rather than another member sharing their login", () => {
    expect(resolveChallengeTarget(players, "second")?.club_member_id).toBe("second");
  });
  it("does not select a player missing from the active club ladder", () => {
    expect(resolveChallengeTarget(players, "other-club-member")).toBeUndefined();
  });
  it("keeps NSC positions 70 and 68 blocked by the existing same-row pyramid rule", () => {
    expect(evaluateChallenge({
      config: { ...DEFAULT_LADDER_CONFIG, format: "pyramid", challenge_levels_up: 5 },
      myPosition: 70, opponentPosition: 68, sameGenderGroup: true,
    })).toMatchObject({ allowed: false, reason: "You may only challenge players in the row directly above you." });
  });
});