import { describe, expect, it } from "vitest";
import { diamondPositionPoints, type DiamondScoredMatch } from "@/lib/tournaments/diamond-position-points";
import { DIAMOND_TEAM_DEFAULTS, type DiamondTeam, type DiamondWeek } from "@/lib/tournaments/team-league";

const teams: DiamondTeam[] = [
  { id: "home", name: "Home", pool: "A", players: ["reserve", "a2", "a3", "a4"] },
  { id: "away", name: "Away", pool: "B", players: ["b1", "b2", "b3", "b4"] },
];
const weeks: DiamondWeek[] = [{ week: 1, date: "2026-10-01", stage: "pool", ties: [{ id: "tie", home: "home", away: "away", court: 1 }] }];
const config = { ...DIAMOND_TEAM_DEFAULTS, playersPerTeam: 4 };
const match = (index: number, a: string | null, b: string | null, home: number, away: number, extras: Partial<DiamondScoredMatch> = {}): DiamondScoredMatch => ({
  stage_key: `dl:tie:${index}`, status: "completed", side_a_points: home, side_b_points: away,
  player_a_member_id: a, player_b_member_id: b, partner_a_member_id: null, partner_b_member_id: null, ...extras,
});

describe("Diamond League position points", () => {
  it("carries old and substitute singles scores into the same team position without altering either game", () => {
    const oldGame = match(3, "former", "b1", 12, 8);
    const newGame = match(3, "reserve", "b1", 7, 9);
    const totals = diamondPositionPoints(teams, weeks, config, [oldGame, newGame]);
    expect(totals.get("home:1")).toBe(19);
    expect(totals.get("away:1")).toBe(17);
    expect(oldGame.player_a_member_id).toBe("former");
  });

  it("credits seeded doubles to each player's historical slot, not the doubles game order", () => {
    const rows = [
      match(3, "former", "b1", 12, 8),
      match(2, "a2", "b2", 6, 7),
      match(5, "a2", "b1", 9, 11, { partner_a_member_id: "former", partner_b_member_id: "b2" }),
    ];
    const totals = diamondPositionPoints(teams, weeks, config, rows);
    expect(totals.get("home:1")).toBe(21);
    expect(totals.get("home:2")).toBe(15);
    expect(totals.get("away:1")).toBe(19);
  });

  it("does not count unfinished games or guess an unknown doubles player's position", () => {
    const totals = diamondPositionPoints(teams, weeks, config, [
      match(3, "former", "b1", 12, 8, { status: "scheduled" }),
      match(5, "unknown", "b1", 9, 11, { partner_a_member_id: "a2", partner_b_member_id: "b2" }),
    ]);
    expect(totals.get("home:1")).toBeUndefined();
    expect(totals.get("home:2")).toBe(9);
  });

  it("accumulates position points through pool, semi-final and final games", () => {
    const allWeeks: DiamondWeek[] = [
      ...weeks,
      { week: 2, date: "2026-10-08", stage: "semi", ties: [{ id: "semi", home: "home", away: "away", court: 1 }] },
      { week: 3, date: "2026-10-15", stage: "final", ties: [{ id: "final", home: "home", away: "away", court: 1 }] },
    ];
    const rows = [
      match(3, "reserve", "b1", 10, 8),
      { ...match(3, "reserve", "b1", 12, 9), stage_key: "dl:semi:3" },
      { ...match(3, "reserve", "b1", 14, 11), stage_key: "dl:final:3" },
    ];

    const totals = diamondPositionPoints(teams, allWeeks, config, rows);
    expect(totals.get("home:1")).toBe(36);
    expect(totals.get("away:1")).toBe(28);
  });
});