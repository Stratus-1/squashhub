import { describe, expect, it } from "vitest";
import { chronologicalTournamentMatches, tournamentMatchDays } from "@/lib/tournaments/schedule-order";

describe("Diamond League match days", () => {
  it("sorts division dates independently of round numbers, retaining times and data", () => {
    const matches = [
      { id: "a1", round_number: 1, scheduled_date: "2026-10-07", scheduled_time: "17:45" },
      { id: "b1-late", round_number: 1, scheduled_date: "2026-10-22", scheduled_time: "21:09" },
      { id: "a2", round_number: 2, scheduled_date: "2026-10-14", scheduled_time: "17:45" },
      { id: "b2", round_number: 2, scheduled_date: "2026-10-29", scheduled_time: "17:45" },
      { id: "a3", round_number: 3, scheduled_date: "2026-10-28", scheduled_time: "17:45" },
      { id: "b1-early", round_number: 1, scheduled_date: "2026-10-22", scheduled_time: "17:45" },
      { id: "undated", round_number: 0, scheduled_date: null, scheduled_time: null },
    ];
    const before = JSON.stringify(matches);
    const days = tournamentMatchDays(matches);
    expect(days.map(([date]) => date)).toEqual([
      "2026-10-07", "2026-10-14", "2026-10-22", "2026-10-28", "2026-10-29", "TBD",
    ]);
    expect(days[2][1].map((m) => m.id)).toEqual(["b1-early", "b1-late"]);
    expect(JSON.stringify(matches)).toBe(before);
  });
});

describe("Bells tournament schedule order", () => {
  it("orders every game by date, time and then court", () => {
    const matches = [
      { id: "round-4", scheduled_date: "2026-09-19", scheduled_time: "11:00:00", court: { name: "Court 2" } },
      { id: "live-round-1", scheduled_date: "2026-09-19", scheduled_time: "10:00:00", court: { name: "Court 10" } },
      { id: "round-3", scheduled_date: "2026-09-19", scheduled_time: "10:30:00", court: { name: "Court 1" } },
      { id: "round-2", scheduled_date: "2026-09-19", scheduled_time: "10:00:00", court: { name: "Court 2" } },
      { id: "unscheduled", scheduled_date: null, scheduled_time: null, court: null },
    ];

    expect(chronologicalTournamentMatches(matches).map((match) => match.id)).toEqual([
      "round-2",
      "live-round-1",
      "round-3",
      "round-4",
      "unscheduled",
    ]);
  });

  it("does not mutate the query result", () => {
    const matches = [
      { id: "later", scheduled_date: "2026-09-19", scheduled_time: "11:00:00" },
      { id: "earlier", scheduled_date: "2026-09-19", scheduled_time: "10:00:00" },
    ];

    chronologicalTournamentMatches(matches);
    expect(matches.map((match) => match.id)).toEqual(["later", "earlier"]);
  });
});