import { describe, it, expect } from "vitest";
import {
  isPastTournament,
  isCurrentTournament,
  isNeedsDatesTournament,
  isCancelledTournament,
  splitTournamentsByLifecycle,
} from "@/lib/tournaments/lifecycle";

const TODAY = "2026-08-20";

const rows = [
  { id: "july-completed", status: "completed", start_date: "2026-07-01", end_date: "2026-07-05" },
  { id: "july-planning", status: "planning", start_date: "2026-07-10", end_date: "2026-07-12" },
  { id: "cancelled-future", status: "cancelled", start_date: "2026-09-01", end_date: "2026-09-03" },
  { id: "abandoned", status: "abandoned", start_date: "2026-08-19", end_date: "2026-08-21" },
  { id: "no-dates", status: "planning", start_date: null, end_date: null },
  { id: "running", status: "in_progress", start_date: "2026-08-18", end_date: "2026-08-22" },
  { id: "upcoming", status: "planning", start_date: "2026-08-27", end_date: "2026-08-28" },
  { id: "single-day-past", status: "planning", start_date: "2026-07-16", end_date: null },
];

describe("tournament lifecycle", () => {
  it("treats July events as past even when the status was never closed off", () => {
    expect(isPastTournament(rows[1], TODAY)).toBe(true);
    expect(isPastTournament(rows[7], TODAY)).toBe(true);
  });

  it("treats cancelled/abandoned tournaments as past regardless of dates", () => {
    expect(isPastTournament(rows[2], TODAY)).toBe(true);
    expect(isPastTournament(rows[3], TODAY)).toBe(true);
    expect(isCancelledTournament(rows[2])).toBe(true);
  });

  it("never puts undated records in current", () => {
    expect(isCurrentTournament(rows[4], TODAY)).toBe(false);
    expect(isNeedsDatesTournament(rows[4])).toBe(true);
  });

  it("keeps running and upcoming tournaments current", () => {
    expect(isCurrentTournament(rows[5], TODAY)).toBe(true);
    expect(isCurrentTournament(rows[6], TODAY)).toBe(true);
  });

  it("splits a mixed list correctly and sorts running first", () => {
    const { current, past, needsDates } = splitTournamentsByLifecycle(rows, TODAY);
    expect(current.map((r) => r.id)).toEqual(["running", "upcoming"]);
    expect(needsDates.map((r) => r.id)).toEqual(["no-dates"]);
    expect(past.map((r) => r.id).sort()).toEqual(
      ["abandoned", "cancelled-future", "july-completed", "july-planning", "single-day-past"].sort(),
    );
  });
});
