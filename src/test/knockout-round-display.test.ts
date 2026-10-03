import { describe, expect, it } from "vitest";
import { knockoutCategoryNames, pacedKnockoutRound } from "@/lib/tournaments/knockout-round-display";

describe("paced knockout Games headings", () => {
  const match = (group: number, round: number, label = `Round ${round}`) => ({
    champ_id: "nsp", group_number: group, stage: "ko", stage_key: `g${group}-knockout`,
    stage_label: label, round_number: round,
  });

  it("shows each category's stored knockout round, without deriving it from dates or field size", () => {
    expect([match(4, 1), match(5, 1), match(1, 2), match(2, 2), match(3, 2)].map(pacedKnockoutRound))
      .toEqual([1, 1, 2, 2, 2]);
  });

  it("keeps formal play-offs and non-structured rounds out of paced headings", () => {
    expect(pacedKnockoutRound(match(5, 1, "Quarterfinal"))).toBeNull();
    expect(pacedKnockoutRound({ ...match(5, 2), stage: "playoff_sf" })).toBeNull();
    expect(pacedKnockoutRound({ ...match(5, 2), stage_key: null })).toBeNull();
  });

  it("lists categories only once while keeping categories with the same round distinct", () => {
    const items = [match(4, 1), match(4, 1), match(5, 1)];
    expect(knockoutCategoryNames(items, (m) => ({ 4: "Ladies 1st", 5: "Boys" })[m.group_number]))
      .toEqual(["Ladies 1st", "Boys"]);
  });
});