import { describe, it, expect } from "vitest";
import {
  currentRoundNumber,
  ensureRound,
  isFinalsStage,
  isSelfScheduledKnockout,
  knockoutRoundCount,
  nextRoundReady,
  patchRound,
  roundProgress,
  roundStageLabel,
  roundIsClubScheduled,
} from "../self-scheduled-rounds";
import { parseRoundDeadlines, serializeRoundDeadlines } from "../round-deadlines";

describe("isSelfScheduledKnockout", () => {
  it("only applies when self-scheduled and every division is a knockout", () => {
    expect(isSelfScheduledKnockout("self", ["knockout", "knockout"])).toBe(true);
    expect(isSelfScheduledKnockout("club", ["knockout"])).toBe(false);
    expect(isSelfScheduledKnockout("self", ["knockout", "single_round_robin"])).toBe(false);
    expect(isSelfScheduledKnockout("self", [])).toBe(false);
  });
});

describe("round progress", () => {
  const rows = [
    { round_number: 1, status: "completed" },
    { round_number: 1, status: "completed" },
    { round_number: 2, status: "scheduled" },
  ];
  it("buckets by round", () => {
    expect(roundProgress(rows)).toEqual([
      { roundNumber: 1, total: 2, completed: 2, complete: true },
      { roundNumber: 2, total: 1, completed: 0, complete: false },
    ]);
  });
  it("current round is the first unfinished round", () => {
    expect(currentRoundNumber(roundProgress(rows))).toBe(2);
  });
  it("defaults to round 1 with no matches", () => {
    expect(currentRoundNumber([])).toBe(1);
    expect(nextRoundReady([])).toBe(false);
  });
  it("advances past the last round when everything is played", () => {
    const done = roundProgress([{ round_number: 1, status: "completed" }]);
    expect(nextRoundReady(done)).toBe(true);
    expect(currentRoundNumber(done)).toBe(2);
  });
});

describe("stage naming", () => {
  it("names late stages by rounds remaining", () => {
    expect(roundStageLabel(4, 1)).toBe("Final");
    expect(roundStageLabel(3, 2)).toBe("Semi-final");
    expect(roundStageLabel(2, 3)).toBe("Quarter-final");
    expect(roundStageLabel(1, 4)).toBe("Round 1");
    expect(roundStageLabel(1, null)).toBe("Round 1");
  });
  it("flags finals stages", () => {
    expect(isFinalsStage(1)).toBe(true);
    expect(isFinalsStage(2)).toBe(true);
    expect(isFinalsStage(3)).toBe(false);
    expect(isFinalsStage(null)).toBe(false);
  });
  it("derives round counts from entrants", () => {
    expect(knockoutRoundCount(8)).toBe(3);
    expect(knockoutRoundCount(12)).toBe(4);
    expect(knockoutRoundCount(1)).toBe(0);
  });
});

describe("round patching is non-destructive", () => {
  it("keeps earlier rounds untouched", () => {
    const list = [{ label: "Round 1", date: "2026-03-01" }];
    const next = patchRound(list, 2, { date: "2026-03-15" });
    expect(next[0]).toEqual({ label: "Round 1", date: "2026-03-01" });
    expect(next[1].date).toBe("2026-03-15");
  });
  it("pads missing rounds", () => {
    expect(ensureRound([], 3)).toHaveLength(3);
  });
  it("round-trips notes and club override through the jsonb payload", () => {
    const list = patchRound([{ label: "Round 1", date: "2026-03-01" }], 2, {
      date: "2026-03-20",
      notes: "Book your own court",
      mode: "club",
    });
    const stored = serializeRoundDeadlines(list);
    const back = parseRoundDeadlines(stored);
    expect(back[1].notes).toBe("Book your own court");
    expect(back[1].mode).toBe("club");
    expect(roundIsClubScheduled(back, 2)).toBe(true);
    expect(roundIsClubScheduled(back, 1)).toBe(false);
  });
});
