import { describe, it, expect } from "vitest";
import {
  eliminatedMemberIds,
  eliminatedOn,
  winnersOn,
  survivorRows,
  hasKnockoutStage,
} from "@/lib/tournaments/survivors";
import { digestDate } from "@/components/tournaments/DailyDigestCard";

const ko = (over: Partial<any> = {}) => ({
  id: "m1",
  stage: "ko",
  status: "completed",
  scheduled_date: "2026-08-27",
  player_a_member_id: "a",
  player_b_member_id: "b",
  winner_member_id: "a",
  ...over,
});

describe("knockout survivors", () => {
  it("marks the losing side as eliminated", () => {
    expect([...eliminatedMemberIds([ko()])]).toEqual(["b"]);
  });

  it("ignores group-stage losses", () => {
    expect(eliminatedMemberIds([ko({ stage: "group" })]).size).toBe(0);
  });

  it("ignores byes and unfinished matches", () => {
    expect(eliminatedMemberIds([ko({ is_bye: true })]).size).toBe(0);
    expect(eliminatedMemberIds([ko({ status: "scheduled" })]).size).toBe(0);
  });

  it("includes doubles partners on the losing side", () => {
    const out = eliminatedMemberIds([ko({ partner_b_member_id: "b2", partner_a_member_id: "a2" })]);
    expect([...out].sort()).toEqual(["b", "b2"]);
  });

  it("buckets winners and losers per day", () => {
    const rows = [ko(), ko({ id: "m2", scheduled_date: "2026-08-28", player_a_member_id: "c", player_b_member_id: "d", winner_member_id: "d" })];
    expect([...winnersOn(rows, "2026-08-28")]).toEqual(["d"]);
    expect([...eliminatedOn(rows, "2026-08-28")]).toEqual(["c"]);
    expect([...eliminatedOn(rows, "2026-08-27")]).toEqual(["b"]);
  });

  it("filters standings rows down to survivors", () => {
    const out = eliminatedMemberIds([ko()]);
    const rows = [{ club_member_id: "a" }, { club_member_id: "b" }];
    expect(survivorRows(rows, out)).toEqual([{ club_member_id: "a" }]);
  });

  it("detects a knockout bracket", () => {
    expect(hasKnockoutStage([ko({ stage: "group" })])).toBe(false);
    expect(hasKnockoutStage([ko({ stage: "playoff_sf" })])).toBe(true);
  });
});

describe("digest date", () => {
  it("covers today from 22:00", () => {
    expect(digestDate(new Date(2026, 7, 28, 22, 5))).toBe("2026-08-28");
  });
  it("covers yesterday before 22:00", () => {
    expect(digestDate(new Date(2026, 7, 28, 9, 0))).toBe("2026-08-27");
  });
});
