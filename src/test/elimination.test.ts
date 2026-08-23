import { describe, it, expect } from "vitest";
import { eliminatedSide, isEliminated, isKnockoutStage } from "@/lib/tournaments/elimination";

const ko = {
  status: "completed",
  stage: "ko",
  player_a_member_id: "A",
  player_b_member_id: "B",
  winner_member_id: "A",
};

describe("isKnockoutStage", () => {
  it("recognises knockout and play-off stages", () => {
    expect(isKnockoutStage({ stage: "ko" })).toBe(true);
    expect(isKnockoutStage({ stage: "playoff_sf" })).toBe(true);
    expect(isKnockoutStage({ stage: "playoff_final" })).toBe(true);
  });

  it("never treats pool/group play as a knockout", () => {
    expect(isKnockoutStage({ stage: "group" }, { knockout: true })).toBe(false);
    expect(isKnockoutStage({ stage: "pool" })).toBe(false);
  });

  it("falls back to the tournament format when the stage is unset", () => {
    expect(isKnockoutStage({ stage: null }, { knockout: true })).toBe(true);
    expect(isKnockoutStage({ stage: null })).toBe(false);
  });
});

describe("eliminatedSide", () => {
  it("knocks out the loser", () => {
    expect(eliminatedSide(ko)).toBe("b");
    expect(eliminatedSide({ ...ko, winner_member_id: "B" })).toBe("a");
  });

  it("knocks out the loser of a walkover", () => {
    expect(eliminatedSide({ ...ko, status: "walkover" })).toBe("b");
  });

  it("eliminates nobody in a pool match", () => {
    expect(eliminatedSide({ ...ko, stage: "group" })).toBeNull();
  });

  it("eliminates nobody before the match is played", () => {
    expect(eliminatedSide({ ...ko, status: "scheduled", winner_member_id: null })).toBeNull();
    expect(eliminatedSide({ ...ko, status: "in_progress" })).toBeNull();
  });

  it("eliminates nobody on a bye", () => {
    expect(eliminatedSide({ ...ko, is_bye: true })).toBeNull();
  });

  it("eliminates nobody when the winner is unknown", () => {
    expect(eliminatedSide({ ...ko, winner_member_id: null })).toBeNull();
  });

  it("exposes a per-side helper", () => {
    expect(isEliminated(ko, "b")).toBe(true);
    expect(isEliminated(ko, "a")).toBe(false);
  });
});
