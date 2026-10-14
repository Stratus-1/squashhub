import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { fixtureScoreDetails, fixtureState, gameScoreLine } from "@/lib/tournaments/club-fixtures";
import { FixtureCalendar, type CalEvent } from "@/components/tournaments/FixtureCalendar";

const sets = [{ a: 11, b: 5 }, { a: 4, b: 11 }, { a: 11, b: 7 }];
describe("canonical calendar scores", () => {
  it("reads marker JSON and separates games won from authoritative live points", () => {
    const row = { status: "in_progress", game_scores: JSON.stringify({ sets, current: { a: 7, b: 5 } }), side_a_points: 8, side_b_points: 6 };
    expect(fixtureScoreDetails(row)).toEqual({ score: "2–1", gameScores: sets, currentGame: { number: 4, a: 8, b: 6 } });
    expect(gameScoreLine(row.game_scores)).toBe("11-5, 4-11, 11-7");
  });
  it("keeps recorded zeros, supports old current data and array payloads", () => {
    expect(fixtureScoreDetails({ status: "in_progress", game_scores: { sets, current: { a: 8, b: 6 } }, side_a_points: 0, side_b_points: 0 }).currentGame).toEqual({ number: 4, a: 0, b: 0 });
    expect(fixtureScoreDetails({ status: "in_progress", game_scores: { sets, current: { a: 8, b: 6 } } }).currentGame?.a).toBe(8);
    expect(gameScoreLine([[11, 5]])).toBe("11-5");
  });
  it("uses A/B score orientation, never manufactures detailed games from a tally", () => {
    expect(fixtureScoreDetails({ status: "completed", score: "1-3" })).toEqual({ score: "1–3", gameScores: [], currentGame: null });
    expect(fixtureScoreDetails({ status: "completed", score: "3-11, 11-5, 11-4, 11-5" }).score).toBe("3–1");
    expect(fixtureScoreDetails({ status: "completed", game_scores: JSON.stringify({ sets }), side_a_points: 8, side_b_points: 6 }).currentGame).toBeNull();
  });
  it("does not fake missing scores or mutate inputs; preserves points-only results", () => {
    const row = Object.freeze({ status: "scheduled", score: null, game_scores: "bad json" });
    expect(fixtureScoreDetails(row)).toEqual({ score: null, gameScores: [], currentGame: null });
    expect(fixtureScoreDetails({ status: "completed", score: "21-16" }, true).score).toBe("21-16");
    expect(fixtureState({ status: "completed" }, true, false)).toBe("completed");
  });
});

const base: CalEvent = { id: "live", date: "2026-10-14", time: "17:40", court: "Court 1", title: "Willem Pretorius v Ethan Tshabalala", kind: "confirmed", state: "live", ...fixtureScoreDetails({ status: "in_progress", game_scores: { sets }, side_a_points: 8, side_b_points: 6 }) };
describe("calendar live/final presentation", () => {
  it("shows matching block/dialog scores and refreshes the open dialog through LIVE to FINAL", () => {
    const { rerender } = render(<FixtureCalendar events={[base]} />);
    const card = screen.getByTestId("cal-event");
    expect(card.textContent).toContain("LIVE");
    expect(card.textContent).toContain("2–1");
    expect(card.textContent).toContain("Game 4 · 8–6");
    expect(card.className).toContain("border-destructive");
    fireEvent.click(card);
    expect(screen.getByTestId("cal-detail").textContent).toContain("Game 1 · 11–5");
    expect(screen.getByTestId("cal-detail").textContent).toContain(base.title);
    const final = { ...base, state: "completed" as const, score: "3–1", currentGame: null, winner: "Willem Pretorius" };
    rerender(<FixtureCalendar events={[]} historicalEvents={[final]} />);
    expect(screen.getByTestId("cal-detail").textContent).toContain("FINAL");
    expect(screen.getByTestId("cal-detail").textContent).toContain("Final score · 3–1");
    expect(screen.getByTestId("cal-detail").textContent).toContain("Winner · Willem Pretorius");
    expect(screen.getByTestId("cal-detail").textContent).not.toContain("Game 4 · 8–6");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("cal-event").className).toContain("bg-muted");
    expect(screen.getByTestId("cal-event").textContent).toContain("FINAL");
  });
  it("retains finals alongside upcoming scheduled matches by default without invented zeros", () => {
    render(<FixtureCalendar events={[{ ...base, id: "next", state: "upcoming", score: null, gameScores: [], currentGame: null }]} historicalEvents={[{ ...base, state: "completed", currentGame: null }]} />);
    expect(screen.getAllByTestId("cal-event")[0].textContent).not.toContain("0–0");
    expect(screen.getAllByTestId("cal-event")[0].className).toContain("border-primary");
    expect(screen.getAllByTestId("cal-event")).toHaveLength(2);
  });
});