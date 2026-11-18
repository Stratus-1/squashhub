import { describe, it, expect } from "vitest";
import { applyFixtureResultChange, applyRubberChange, liveRubberPollMs } from "@/lib/leagues/live-rubber-cache";

const F = "fx-1";
const rows = [
  { id: "a", fixture_id: F, position: 1, home_games_won: 0, game_scores: [] },
  { id: "b", fixture_id: F, position: 2, home_games_won: 1, game_scores: [[11, 5]] },
];

describe("applyRubberChange", () => {
  it("updates the scored rubber in place without a refetch", () => {
    const next = applyRubberChange(rows, { eventType: "UPDATE", new: { id: "a", fixture_id: F, position: 1, home_games_won: 1 } }, F)!;
    expect(next[0].home_games_won).toBe(1);
    expect(next[0].game_scores).toEqual([]); // omitted column keeps last value
    expect(next[1]).toBe(rows[1]);
  });

  it("adds a new rubber in position order", () => {
    const next = applyRubberChange([rows[1]], { eventType: "INSERT", new: rows[0] }, F)!;
    expect(next.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("asks for a refetch when nothing is cached yet", () => {
    expect(applyRubberChange(undefined, { eventType: "UPDATE", new: rows[0] }, F)).toBeUndefined();
  });

  it("ignores changes for another fixture", () => {
    expect(applyRubberChange(rows, { eventType: "UPDATE", new: { id: "z", fixture_id: "other", position: 1 } }, F)).toBe(rows);
  });

  it("removes a deleted rubber", () => {
    expect(applyRubberChange(rows, { eventType: "DELETE", old: { id: "a" } }, F)!.map((r) => r.id)).toEqual(["b"]);
  });
});

describe("applyFixtureResultChange", () => {
  it("merges updated totals", () => {
    const next = applyFixtureResultChange({ id: "r", fixture_id: F, home_total: 1, status: "draft" }, { eventType: "UPDATE", new: { id: "r", fixture_id: F, home_total: 2 } }, F);
    expect(next).toEqual({ id: "r", fixture_id: F, home_total: 2, status: "draft" });
  });
  it("refetches on delete", () => {
    expect(applyFixtureResultChange({ id: "r" }, { eventType: "DELETE", old: { id: "r" } }, F)).toBeUndefined();
  });
});

describe("liveRubberPollMs", () => {
  it("does not poll when no game is live", () => {
    expect(liveRubberPollMs(false, false)).toBe(false);
  });
  it("polls every 10s only while live updates are down", () => {
    expect(liveRubberPollMs(true, false)).toBe(10_000);
    expect(liveRubberPollMs(true, true)).toBe(60_000);
  });
});
