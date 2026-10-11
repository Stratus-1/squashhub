import { describe, it, expect } from "vitest";
import { selectMyFixtures, mySide, myRecord, myScheduleState, myFixturesHref } from "@/lib/tournaments/my-fixtures";

const T = "2026-10-11";
const m = (id: string, o: any) => ({ id, status: "scheduled", ...o });

describe("my fixtures", () => {
  const home = "home-row", away = "uitsig-row", other = "someone";
  const list = [
    m("late", { scheduled_date: "2026-10-20", player_a_member_id: home, player_b_member_id: other }),
    m("early", { scheduled_date: "2026-10-12", scheduled_time: "18:00", player_b_member_id: away, player_a_member_id: other }),
    m("partner", { scheduled_date: "2026-10-15", partner_a_member_id: home, player_a_member_id: "p", player_b_member_id: other }),
    m("notmine", { scheduled_date: "2026-10-13", player_a_member_id: other, player_b_member_id: "x" }),
    m("done", { status: "completed", scheduled_date: "2026-10-01", player_a_member_id: home, player_b_member_id: other, winner_member_id: home }),
    m("undated", { player_b_member_id: home, player_a_member_id: other }),
  ];

  it("matches across club rows and doubles partners, earliest first, undated last", () => {
    expect(selectMyFixtures(list, [home, away], { today: T }).map((x) => x.id)).toEqual(["early", "partner", "late", "undated"]);
  });
  it("never includes other people's games", () => {
    expect(selectMyFixtures(list, [home], { today: T }).some((x) => x.id === "notmine")).toBe(false);
    expect(selectMyFixtures(list, [], { today: T })).toEqual([]);
  });
  it("includes completed only when asked", () => {
    expect(selectMyFixtures(list, [home], { today: T, includeCompleted: true }).map((x) => x.id)).toContain("done");
  });
  it("sides and doubles W/L", () => {
    expect(mySide(list[2], [home])).toBe("a");
    const dbl = m("d", { status: "completed", player_a_member_id: "p", partner_a_member_id: home, player_b_member_id: other, winner_member_id: "p" });
    expect(myRecord([dbl, list[4]], [home])).toEqual({ w: 2, l: 0 });
    expect(myRecord([{ ...dbl, winner_member_id: other }], [home])).toEqual({ w: 0, l: 1 });
  });
  it("empty states and deep link", () => {
    expect(myScheduleState([], T)).toBe("not_scheduled");
    expect(myScheduleState([list[4]], T)).toBe("finished");
    expect(myScheduleState(list, T)).toBe("upcoming");
    expect(myFixturesHref("abc")).toBe("/tournaments?champ=abc&mine=1");
  });
});
