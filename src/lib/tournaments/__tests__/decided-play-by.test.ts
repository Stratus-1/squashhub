import { describe, expect, it } from "vitest";
import { projectCourtFixtures, projectDecidedPlayByFixtures, type ProjectionInput } from "../projected-court-fixtures";
import { canScheduleFixture } from "../fixture-scheduling";
import { resolveFixtureSchedule } from "../stage-schedule";

const fixtureInput = (): ProjectionInput => ({
  champ: { id: "synthetic-riverside", swiss_rounds: { "4": 3 }, start_time: "18:00", end_time: "21:00", match_duration_minutes: 45 },
  arch: null, courts: [],
  entries: Array.from({ length: 8 }, (_, i) => ({ group_number: 4, order_index: i, club_member_id: `p${i + 1}` })),
  matches: [1, 2, 3, 4].map((p) => ({ id: `r1-${p}`, group_number: 4, round_number: 1, player_a_member_id: `p${p}`, player_b_member_id: `p${9 - p}`, winner_member_id: `p${p}`, status: "completed" })),
  rounds: [{ id: "r2", group_number: 4, round_number: 2, scheduling_mode: "self", play_by: "2026-10-29" }],
});

describe("confirmed Swiss play-by fixtures", () => {
  it("creates confirmed next-round pairings without any court slots", () => {
    const games = projectDecidedPlayByFixtures(fixtureInput());
    expect(games).toHaveLength(4);
    expect(games.map((g) => g.round)).toEqual([2, 2, 2, 2]);
    expect(games.every((g) => g.playBy === "2026-10-29")).toBe(true);
    expect(games.some((g) => "courtId" in g || "time" in g)).toBe(false);
    expect(projectCourtFixtures(fixtureInput())).toEqual([]);
  });
  it("waits until both position occupants are confirmed", () => {
    const input = fixtureInput();
    input.matches = input.matches.map((m) => ({ ...m, status: "scheduled", winner_member_id: null }));
    expect(projectDecidedPlayByFixtures(input)).toEqual([]);
  });
  it("preserves saved games and never duplicates either participant", () => {
    const input = fixtureInput();
    const game = projectDecidedPlayByFixtures(input)[0];
    expect(game).toBeDefined();
    if (!game) return;
    input.matches.push({ id: "saved", group_number: 4, round_number: 2, player_a_member_id: game.aId, player_b_member_id: game.bId, status: "scheduled", booking_id: "existing" });
    const before = JSON.stringify(input);
    const remaining = projectDecidedPlayByFixtures(input);
    expect(remaining).toHaveLength(3);
    expect(remaining.some((g) => [g.aId, g.bId].some((id) => id === game.aId || id === game.bId))).toBe(false);
    expect(JSON.stringify(input)).toBe(before);
  });
  it("does not borrow another category's deadline", () => {
    const input = fixtureInput();
    input.rounds[0].group_number = 3;
    expect(projectDecidedPlayByFixtures(input)).toEqual([]);
  });
  it("uses the target deadline and allows both fixture players to book", () => {
    const input = fixtureInput();
    const game = projectDecidedPlayByFixtures(input)[0];
    expect(game).toBeDefined();
    if (!game) return;
    const saved = { id: "created", round_id: "r2", round_number: 2, group_number: 4, player_a_member_id: game.aId, player_b_member_id: game.bId, status: "scheduled" };
    expect(resolveFixtureSchedule(saved, { rows: input.rounds })).toEqual({ mode: "play_by", playBy: "2026-10-29", bookable: true });
    expect(canScheduleFixture(saved, game.aId).allowed).toBe(true);
    expect(canScheduleFixture(saved, game.bId).allowed).toBe(true);
    expect(canScheduleFixture(saved, "other-player").allowed).toBe(false);
  });
});