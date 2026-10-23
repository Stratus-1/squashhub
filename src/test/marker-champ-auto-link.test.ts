import { describe, expect, it } from "vitest";
import { mayAutoLinkChampFixture } from "@/lib/marker/champ-auto-link";

const base = {
  isForfeit: false,
  isDoubles: false,
  playerAMemberId: "a",
  playerBMemberId: "b",
  clubId: "club",
};

describe("mayAutoLinkChampFixture", () => {
  it("allows linking when the game was set up as Club Champs", () => {
    expect(mayAutoLinkChampFixture({ ...base, matchType: "club_champs" })).toBe(true);
  });

  it("allows linking when the game was set up as a tournament game", () => {
    expect(mayAutoLinkChampFixture({ ...base, matchType: "tournament" })).toBe(true);
  });

  it("never links a friendly game to a tournament fixture", () => {
    expect(mayAutoLinkChampFixture({ ...base, matchType: "friendly" })).toBe(false);
  });

  it("never links a ladder game to a tournament fixture", () => {
    expect(mayAutoLinkChampFixture({ ...base, matchType: "ladder" })).toBe(false);
  });

  it("never links a league game to a tournament fixture", () => {
    expect(mayAutoLinkChampFixture({ ...base, matchType: "league" })).toBe(false);
  });

  it("never links forfeits, doubles, or games without both members and a club", () => {
    expect(mayAutoLinkChampFixture({ ...base, matchType: "club_champs", isForfeit: true })).toBe(false);
    expect(mayAutoLinkChampFixture({ ...base, matchType: "club_champs", isDoubles: true })).toBe(false);
    expect(mayAutoLinkChampFixture({ ...base, matchType: "club_champs", playerBMemberId: null })).toBe(false);
    expect(mayAutoLinkChampFixture({ ...base, matchType: "club_champs", clubId: null })).toBe(false);
  });
});
