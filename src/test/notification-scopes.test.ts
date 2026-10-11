import { describe, it, expect } from "vitest";
import { buildNotificationScopes } from "@/lib/smart-builder/notification-scopes";

const divs = [{ groupNumber: 1, label: "Men's A · Singles" }, { groupNumber: 2, label: "Ladies" }, { groupNumber: 3, label: "Men's B" }];
describe("player notification scopes", () => {
  it("groups fixtures per category × round/stage, keeps stages separate, marks sent", () => {
    const s = buildNotificationScopes([
      { group_number: 1, round_number: 1 }, { group_number: 1, round_number: 1 },
      { group_number: 1, round_number: 1, stage_key: "qf", stage_label: "Quarterfinal" },
      { group_number: 2, round_number: 2, status: "completed" },
    ], divs, { draw_notices: { "1:r1": { at: "2026-10-01T10:00:00Z", sent: 9 } } });
    const men = s.filter((x) => x.categoryLabel === "Men's A");
    expect(men.map((x) => [x.title, x.games])).toEqual([["Quarterfinal", 1], ["Round 1", 2]]);
    expect(men.find((x) => x.title === "Round 1")!.sent?.sent).toBe(9);
    expect(men.find((x) => x.title === "Quarterfinal")!.scope.stageKey).toBe("qf");
  });
  it("categories with no draw get a template-only scope (sending disabled)", () => {
    const b = buildNotificationScopes([{ group_number: 1, round_number: 1 }], divs, null).find((x) => x.categoryLabel === "Men's B")!;
    expect(b).toMatchObject({ hasFixtures: false, games: 0, sent: null, title: "Round 1" });
  });
});
