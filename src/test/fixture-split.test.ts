import { describe, it, expect } from "vitest";
import { splitFixtures, tabFromParam } from "@/lib/tournaments/fixture-split";

describe("Upcoming Fixtures vs Results", () => {
  const games = [
    { id: "s", status: "scheduled" }, { id: "u", status: "scheduled", scheduled_date: null },
    { id: "live", status: "in_progress" }, { id: "done", status: "completed", winner_member_id: "a" },
    { id: "bye", status: "scheduled", is_bye: true }, { id: "x", status: "cancelled" }, { id: "wo", status: "walkover_void" },
  ];
  it("puts every game in exactly one list", () => {
    const { upcoming, results } = splitFixtures(games);
    expect(upcoming.map((g) => g.id)).toEqual(["s", "u", "live"]);
    expect(results.map((g) => g.id)).toEqual(["done", "bye", "x", "wo"]);
    expect(upcoming.length + results.length).toBe(games.length);
  });
  it("deep links pick the tab; default is Standings", () => {
    expect(tabFromParam(null)).toBe("standings");
    expect(tabFromParam("standings")).toBe("standings");
    expect(tabFromParam("upcoming")).toBe("upcoming");
    expect(tabFromParam("fixtures")).toBe("upcoming");
    expect(tabFromParam("results")).toBe("results");
  });
});
