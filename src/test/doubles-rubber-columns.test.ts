import { describe, it, expect } from "vitest";
import { doublesRubberColumns, dropEmptyGames } from "@/lib/leagues/doubles-rubber-columns";

describe("doubles rubber columns", () => {
  const ids = { "ANNA SMIT": "a", "BEN DU TOIT": "b", "CARA LE ROUX": "c" };
  it("saves both players with member links", () => {
    const c = doublesRubberColumns("Anna Smit & Ben du Toit", "Cara le Roux & Sub Guy", ids);
    expect(c).toMatchObject({
      rubber_type: "doubles",
      home_player_member_id: "a", home_player2_member_id: "b", home_player2_name: "Ben du Toit",
      away_player_member_id: "c", away_player2_member_id: null, away_player2_name: "Sub Guy",
    });
  });
  it("leaves sides without a pair untouched", () => {
    expect(doublesRubberColumns("", "Solo", ids)).toEqual({ rubber_type: "doubles" });
  });
});

describe("empty games", () => {
  it("never keeps a 0-0 game", () => {
    expect(dropEmptyGames([{ home: 11, away: 7 }, { home: 0, away: 0 }])).toEqual([{ home: 11, away: 7 }]);
  });
});
