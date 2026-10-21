import { describe, expect, it } from "vitest";
import { StandardFormat } from "@/lib/tournament-formats/standard";
import type { StandingsStats } from "@/lib/tournament-formats/types";

const empty = (): StandingsStats => ({ played: 0, won: 0, lost: 0, gamesWon: 0, gamesLost: 0, byes: 0, pointsFor: 0, pointsAgainst: 0 });
describe("saved standard scores in standings", () => {
  it.each([
    ["15-8, 15-10, 15-6", "a", 45, 24],
    ["6-15, 12-15, 8-15", "b", 45, 26],
  ])("counts the completed three-game win %s", (score, winner, pointsFor, pointsAgainst) => {
    const match = { player_a_member_id: "a", player_b_member_id: "b", winner_member_id: winner, score, status: "completed", game_scores: null };
    const before = JSON.stringify(match);
    const win = empty(), loss = empty();
    StandardFormat.applyMatchToStats(win, match, winner, false);
    StandardFormat.applyMatchToStats(loss, match, winner === "a" ? "b" : "a", false);
    expect(win).toMatchObject({ won: 1, gamesWon: 3, gamesLost: 0, pointsFor, pointsAgainst });
    expect(loss).toMatchObject({ lost: 1, gamesWon: 0, gamesLost: 3, pointsFor: pointsAgainst, pointsAgainst: pointsFor });
    expect(JSON.stringify(match)).toBe(before);
  });
  it("counts a games-only summary without inventing rally points", () => {
    const stats = empty();
    StandardFormat.applyMatchToStats(stats, { player_a_member_id: "a", player_b_member_id: "b", winner_member_id: "a", score: "3-1" }, "a", false);
    expect(stats).toMatchObject({ gamesWon: 3, gamesLost: 1, pointsFor: 0, pointsAgainst: 0 });
  });
  it("prefers saved set JSON without counting score text twice", () => {
    const stats = empty();
    StandardFormat.applyMatchToStats(stats, { player_a_member_id: "a", player_b_member_id: "b", winner_member_id: "a", score: "3-0", game_scores: JSON.stringify({ sets: [{ a: 11, b: 5 }, { a: 11, b: 4 }, { a: 11, b: 3 }] }) }, "a", false);
    expect(stats).toMatchObject({ gamesWon: 3, gamesLost: 0, pointsFor: 33, pointsAgainst: 12 });
  });
});