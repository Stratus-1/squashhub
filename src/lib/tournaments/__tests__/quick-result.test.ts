import { describe, it, expect } from "vitest";
import {
  buildQuickResultPayload,
  canEnterChampResult,
  defaultGameScores,
  gamesToWin,
  possibleGameTallies,
  validateQuickResult,
} from "../quick-result";

const P1 = "member-a";
const P2 = "member-b";
const base = {
  id: "m1",
  status: "scheduled",
  player_a_member_id: P1,
  player_b_member_id: P2,
};

describe("best-of maths", () => {
  it("derives games needed", () => {
    expect(gamesToWin(5)).toBe(3);
    expect(gamesToWin(3)).toBe(2);
    expect(gamesToWin(0)).toBe(3); // falls back to best of 5
  });

  it("lists legal tallies", () => {
    expect(possibleGameTallies(5)).toEqual([
      { won: 3, lost: 0 },
      { won: 3, lost: 1 },
      { won: 3, lost: 2 },
    ]);
    expect(possibleGameTallies(3)).toEqual([
      { won: 2, lost: 0 },
      { won: 2, lost: 1 },
    ]);
  });

  it("prefills per-game scores for a tally", () => {
    expect(defaultGameScores("a", 3, 1, 11)).toEqual([
      { a: 11, b: 0 },
      { a: 11, b: 0 },
      { a: 11, b: 0 },
      { a: 0, b: 11 },
    ]);
  });
});

describe("validateQuickResult", () => {
  it("accepts a 3-0", () => {
    const v = validateQuickResult(defaultGameScores("a", 3, 0), 5);
    expect(v.valid).toBe(true);
    expect(v.winner).toBe("a");
  });

  it("accepts a 3-2 with real game scores", () => {
    const v = validateQuickResult(
      [{ a: 11, b: 9 }, { a: 8, b: 11 }, { a: 11, b: 5 }, { a: 6, b: 11 }, { a: 12, b: 10 }],
      5,
    );
    expect(v).toMatchObject({ valid: true, winner: "a", gamesA: 3, gamesB: 2 });
  });

  it("rejects an incomplete match", () => {
    expect(validateQuickResult([{ a: 11, b: 5 }, { a: 11, b: 7 }], 5).valid).toBe(false);
  });

  it("rejects tied games", () => {
    expect(validateQuickResult([{ a: 11, b: 11 }], 5).error).toMatch(/tie/i);
  });

  it("rejects negative or fractional scores", () => {
    expect(validateQuickResult([{ a: -1, b: 11 }], 5).valid).toBe(false);
    expect(validateQuickResult([{ a: 1.5, b: 11 }], 5).valid).toBe(false);
  });

  it("rejects dead rubbers played after the match was decided", () => {
    const games = [...defaultGameScores("a", 3, 0), { a: 3, b: 11 }];
    expect(validateQuickResult(games, 5).valid).toBe(false);
  });

  it("rejects more games than the best-of allows", () => {
    const games = [
      { a: 11, b: 1 }, { a: 1, b: 11 }, { a: 11, b: 1 }, { a: 1, b: 11 },
      { a: 11, b: 1 }, { a: 1, b: 11 },
    ];
    expect(validateQuickResult(games, 5).valid).toBe(false);
  });

  it("honours a best of 3 tournament", () => {
    expect(validateQuickResult(defaultGameScores("b", 2, 1), 3)).toMatchObject({ valid: true, winner: "b" });
  });
});

describe("buildQuickResultPayload", () => {
  it("produces the same shape the live marker sends", () => {
    const p = buildQuickResultPayload([{ a: 11, b: 9 }, { a: 5, b: 11 }, { a: 11, b: 3 }, { a: 11, b: 8 }], 5);
    expect(p.score).toBe("11-9, 5-11, 11-3, 11-8");
    expect(JSON.parse(p.gameScores)).toEqual({
      sets: [{ a: 11, b: 9 }, { a: 5, b: 11 }, { a: 11, b: 3 }, { a: 11, b: 8 }],
    });
    expect(p.winner).toBe("a");
    expect(p.gamesA).toBe(3);
    expect(p.gamesB).toBe(1);
  });

  it("throws on an invalid result rather than saving rubbish", () => {
    expect(() => buildQuickResultPayload([{ a: 11, b: 9 }], 5)).toThrow();
  });
});

describe("canEnterChampResult visibility", () => {
  it("is visible to each player", () => {
    expect(canEnterChampResult(base, P1).allowed).toBe(true);
    expect(canEnterChampResult(base, P2).allowed).toBe(true);
  });

  it("is visible to a doubles partner", () => {
    expect(canEnterChampResult({ ...base, partner_a_member_id: "p-a" }, "p-a").allowed).toBe(true);
  });

  it("is visible to club/tournament officials", () => {
    expect(canEnterChampResult(base, "someone-else", { canManage: true }).allowed).toBe(true);
  });

  it("is hidden from unrelated members", () => {
    expect(canEnterChampResult(base, "stranger").allowed).toBe(false);
  });

  it("is NOT blocked by a missing court booking (self-scheduled)", () => {
    const unscheduled = { ...base, scheduled_date: null, scheduled_time: null, court_id: null };
    expect(canEnterChampResult(unscheduled, P1).allowed).toBe(true);
  });

  it("stays available once a court is booked", () => {
    const scheduled = { ...base, scheduled_date: "2026-08-25", scheduled_time: "13:00", court_id: 3 };
    expect(canEnterChampResult(scheduled, P1).allowed).toBe(true);
  });

  it("is hidden for a bye", () => {
    expect(canEnterChampResult({ ...base, is_bye: true }, P1).allowed).toBe(false);
  });

  it("is hidden when the opponent is still TBD", () => {
    expect(canEnterChampResult({ ...base, player_b_member_id: null }, P1).allowed).toBe(false);
  });

  it("is hidden once the match is completed", () => {
    expect(canEnterChampResult({ ...base, status: "completed", winner_member_id: P1 }, P1).allowed).toBe(false);
    expect(canEnterChampResult({ ...base, status: "walkover" }, P1).allowed).toBe(false);
  });
});
