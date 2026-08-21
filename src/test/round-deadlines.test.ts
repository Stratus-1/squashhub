import { describe, it, expect } from "vitest";
import {
  parseRoundDeadlines,
  serializeRoundDeadlines,
  deadlineForRound,
  lastDeadline,
  roundDeadlineLines,
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
