import { describe, expect, it } from "vitest";
import { chronologicalTournamentMatches } from "@/lib/tournaments/schedule-order";

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