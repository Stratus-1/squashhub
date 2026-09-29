import { describe, it, expect } from "vitest";
import {
  DIAMOND_TEAM_DEFAULTS as D, tieGames, gameLabel, poolRounds, CROSSOVER, PLACING_FINALS,
  tieResult, standings, nightPlan, configIssues, DOUBLES_PAIRING_LABEL,
} from "@/lib/tournaments/team-league";

describe("Diamond League (teams)", () => {
  it("6 per team: 6 singles #6→#1 then doubles 5+6, 3+4, 1+2", () => {
    expect(tieGames(D).map(gameLabel)).toEqual([
      "Singles #6", "Singles #5", "Singles #4", "Singles #3", "Singles #2", "Singles #1",
      "Doubles #5+#6", "Doubles #3+#4", "Doubles #1+#2",
    ]);
  });
  it("4 per team: 4 singles + 2 doubles", () => {
    expect(tieGames({ ...D, playersPerTeam: 4 }).map(gameLabel)).toEqual([
      "Singles #4", "Singles #3", "Singles #2", "Singles #1", "Doubles #3+#4", "Doubles #1+#2",
    ]);
  });
  it("rejects odd team sizes", () => {
    expect(configIssues({ ...D, playersPerTeam: 5 })).toHaveLength(1);
  });
  it("pool of 4 follows the email week order", () => {
    expect(poolRounds(4)).toEqual([[[1, 4], [2, 3]], [[1, 2], [3, 4]], [[1, 3], [2, 4]]]);
  });
  it("other pool sizes: everyone meets once", () => {
    const r = poolRounds(5).flat();
    expect(r).toHaveLength(10);
    expect(new Set(r.map((p) => p.join("-"))).size).toBe(10);
  });
  it("crossover and placings", () => {
    expect(CROSSOVER.map((c) => `A${c.a}vB${c.b}`)).toEqual(["A1vB2", "A2vB1", "A3vB4", "A4vB3"]);
    expect(PLACING_FINALS.map((f) => f.places)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]]);
  });
  it("tie winner gets bonus; draw gives none unless configured", () => {
    const s = Array(9).fill({ home: 30, away: 25 });
    expect(tieResult(s, 9, 5)).toMatchObject({ winner: "home", homePoints: 270, homeBonus: 5, awayBonus: 0 });
    const d = tieResult(Array(9).fill({ home: 30, away: 30 }), 9, 5);
    expect(d).toMatchObject({ winner: "draw", homeBonus: 0, awayBonus: 0 });
    expect(tieResult([{ home: 1, away: 0 }, null], 2, 5).complete).toBe(false);
  });
  it("standings carry points and flag level totals as undecided", () => {
    const win = tieResult(Array(9).fill({ home: 30, away: 25 }), 9, 5);
    const pool = standings(["a", "b"], [{ homeId: "a", awayId: "b", result: win }]);
    expect(pool.rows.map((r) => [r.teamId, r.total])).toEqual([["a", 275], ["b", 225]]);
    const semis = standings(["a", "b"], [], new Map(pool.rows.map((r) => [r.teamId, r.total])));
    expect(semis.rows[0].total).toBe(275);
    const level = standings(["x", "y"], []);
    expect(level.undecided).toEqual([["x", "y"]]);
  });
  it("night timing: 2 ties on 2 courts fit 17:45–21:15", () => {
    const p = nightPlan(D, 2);
    expect(p.tieMinutes).toBe(210);
    expect(p.finish).toBe("21:15");
    expect(p.overruns).toBe(false);
    expect(nightPlan({ ...D, courts: 1 }, 2).overruns).toBe(true);
  });
});

import { decideLevelFinal } from "@/lib/tournaments/team-league";
describe("organiser options", () => {
  const lvl = Array(9).fill({ home: 30, away: 30 });
  it("draw: split gives 2.5 each, both gives 5 each", () => {
    expect(tieResult(lvl, 9, 5, "split")).toMatchObject({ homeBonus: 2.5, awayBonus: 2.5 });
    expect(tieResult(lvl, 9, 5, "both")).toMatchObject({ homeBonus: 5, awayBonus: 5 });
  });
  it("most wins separates level totals", () => {
    const w = tieResult(Array(9).fill({ home: 30, away: 25 }), 9, 5);
    const l = tieResult(Array(9).fill({ home: 25, away: 30 }), 9, 5);
    // a and b both end on 500: a won 2 ties, b won 1 tie + bigger losing points
    const ties = [
      { homeId: "a", awayId: "x", result: w }, { homeId: "a", awayId: "y", result: w },
      { homeId: "b", awayId: "x", result: { ...l, homePoints: 250, homeBonus: 0 } },
    ];
    const t = standings(["a", "b"], ties, new Map([["b", 300]]), ["most_wins"]);
    expect(t.rows[0].teamId).toBe(t.rows[0].total >= t.rows[1].total ? t.rows[0].teamId : "");
    const eq = standings(["a", "b"], [
      { homeId: "a", awayId: "x", result: w }, { homeId: "b", awayId: "x", result: { ...l, homePoints: 275, homeBonus: 0, winner: "away" } },
    ], undefined, ["most_wins"]);
    expect(eq.rows[0].teamId).toBe("a");
    expect(eq.undecided).toEqual([]);
  });
  it("level final decided by games won", () => {
    const s = [...Array(4).fill({ home: 20, away: 10 }), ...Array(5).fill({ home: 10, away: 18 })];
    const r = tieResult(s, 9, 5);
    expect(r.winner).toBe("draw");
    expect(decideLevelFinal(s, r, "games_won")).toBe("away");
    expect(decideLevelFinal(s, r, "organiser")).toBeNull();
  });
  it("doubles pairing: owner picks fixed positions or singles results; default is singles results", () => {
    expect(D.doublesPairing).toBe("singles_results");
    expect(DOUBLES_PAIRING_LABEL.position).toContain("team position");
    expect(DOUBLES_PAIRING_LABEL.singles_results).toContain("singles results");
  });
});

import { autoSlotPlayers } from "@/lib/tournaments/team-league";
describe("autoSlotPlayers", () => {
  const empty = () => [{ id: "t1", players: [null, null] }, { id: "t2", players: [null, null] }] as { id: string; players: (string | null)[] }[];
  it("snakes strongest players across teams by slot", () => {
    const r = autoSlotPlayers(["a", "b", "c", "d"], empty());
    expect(r.teams[0].players).toEqual(["a", "d"]);
    expect(r.teams[1].players).toEqual(["b", "c"]);
  });
  it("never moves locked placements and fills only empty slots", () => {
    const t = empty(); t[1].players[0] = "a";
    const r = autoSlotPlayers(["a", "b", "c"], t, new Set(["t2:0"]));
    expect(r.teams[1].players[0]).toBe("a");
    expect(r.teams[0].players[0]).toBe("b");
  });
  it("empties slots of withdrawn players, keeps locked, reports overflow", () => {
    const t = empty(); t[0].players = ["x", "y"];
    const r = autoSlotPlayers(["y", "p", "q", "r", "s"], t, new Set(["t0:0"]));
    expect(r.removed).toEqual(["x"]);
    expect(r.unplaced).toEqual(["s"]);
  });
});
