import { describe, it, expect } from "vitest";
import {
  parseRoundDeadlines,
  serializeRoundDeadlines,
  deadlineForRound,
  lastDeadline,
  roundDeadlineLines,
  mergeRoundDeadlines,
  deadlineForStage,
} from "@/lib/tournaments/round-deadlines";

describe("round deadlines", () => {
  it("parses a legacy single date string", () => {
    expect(parseRoundDeadlines("2026-09-15")).toEqual([{ label: "All rounds", date: "2026-09-15" }]);
  });
  it("parses arrays of dates and objects", () => {
    expect(parseRoundDeadlines(["2026-09-15", { label: "Final", date: "2026-10-01" }])).toEqual([
      { label: "Round 1", date: "2026-09-15" },
      { label: "Final", date: "2026-10-01" },
    ]);
  });
  it("parses a round-keyed object", () => {
    expect(parseRoundDeadlines({ "2": "2026-09-20", "1": "2026-09-10" })).toEqual([
      { label: "Round 1", date: "2026-09-10" },
      { label: "Round 2", date: "2026-09-20" },
    ]);
  });
  it("serializes empty input to null", () => {
    expect(serializeRoundDeadlines([{ label: "", date: "" }])).toBeNull();
  });
  it("maps rounds to their deadline and clamps beyond the last", () => {
    const list = [
      { label: "Round 1", date: "2026-09-10" },
      { label: "Final", date: "2026-10-01" },
    ];
    expect(deadlineForRound(list, 1)).toBe("2026-09-10");
    expect(deadlineForRound(list, 2)).toBe("2026-10-01");
    expect(deadlineForRound(list, 7)).toBe("2026-10-01");
    expect(deadlineForRound([], 1)).toBeNull();
    expect(lastDeadline(list)).toBe("2026-10-01");
  });
  it("renders invite lines", () => {
    expect(roundDeadlineLines([{ label: "Round 1", date: "2026-09-15" }])[0]).toMatch(
      /^Round 1 must be played by /,
    );
  });
});

describe("mergeRoundDeadlines — a set date must never move", () => {
  it("keeps the organiser's planned date even when sections are set up later", () => {
    const planned = parseRoundDeadlines([{ label: "Round 3", date: "2026-09-12" }]);
    const merged = mergeRoundDeadlines(planned, [
      { round_number: 1, label: "Round 3", play_by: "2026-09-09" },
      { round_number: 1, label: "Round 3", play_by: "2026-09-14" },
    ]);
    expect(merged[0].date).toBe("2026-09-12");
  });

  it("fills an unplanned round with the earliest section date, not the latest", () => {
    const merged = mergeRoundDeadlines([], [
      { round_number: 1, label: "Round 3", play_by: "2026-09-14" },
      { round_number: 1, label: "Round 3", play_by: "2026-09-09" },
    ]);
    expect(merged[0].date).toBe("2026-09-09");
  });
});

describe("deadlineForStage", () => {
  const plan = [
    { label: "Round 1", date: "2026-08-29" },
    { label: "Round 2", date: "2026-09-05" },
    { label: "Quarter-final", date: "2026-09-17" },
    { label: "Semi-Finals", date: "2026-09-20" },
    { label: "Finals", date: "2026-09-22" },
  ];

  it("uses the named stage, not the round position", () => {
    // Round 3 positionally = 17 Sep, but this division is playing its final.
    expect(deadlineForStage(plan, 3, "Final")).toBe("2026-09-22");
    expect(deadlineForStage(plan, 3, "Section A · Semi-final")).toBe("2026-09-20");
  });

  it("falls back to the round position for unnamed rounds", () => {
    expect(deadlineForStage(plan, 2, "Round 2")).toBe("2026-09-05");
    expect(deadlineForStage(plan, 2, null)).toBe("2026-09-05");
  });

  it("falls back when the stage is not in the plan", () => {
    expect(deadlineForStage(plan, 1, "Play-off")).toBe("2026-08-29");
  });
});
