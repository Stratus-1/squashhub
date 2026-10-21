import { describe, expect, it } from "vitest";
import { buildRoundRobinView, type RRMatchInput } from "@/lib/tournaments/round-robin-view";

const players = [1, 2, 3, 4].map(n => ({ id: `p${n}`, name: `Player ${n}` }));
const match = (a: number, b: number, round: number): RRMatchInput => ({
  id: `${a}-${b}`, a: `p${a}`, b: `p${b}`, round, playBy: "2026-11-12",
});
const make = (matches: RRMatchInput[]) => buildRoundRobinView({ players, matches, seedOrder: players.map(p => p.id), stageRoundCount: 3 });

describe("configured three-round pool presentation", () => {
  it("Pool A follows rounds 1–3 rather than legacy 1/3/5", () => {
    const matches = [match(1,4,1), match(2,3,1), match(1,3,3), match(2,4,3), match(3,4,5), match(1,2,5)];
    const before = JSON.stringify(matches);
    const view = make(matches);
    expect(view.rounds.map(r => r.round)).toEqual([1,2,3]);
    expect(view.rounds.map(r => r.matches.map(m => m.id))).toEqual([["1-4","2-3"],["1-3","2-4"],["3-4","1-2"]]);
    expect(view.matrix.p1.p3?.round).toBe(2);
    expect(JSON.stringify(matches)).toBe(before);
  });
  it("Pool B has two matches and all four players in each of its three rounds", () => {
    const matches = [
      { ...match(1,2,1), status: "completed", winner: "p2", score: "6-15,12-15,8-15" },
      { ...match(4,2,2), date: "2026-10-24", time: "08:15", court: "Court 1" },
      match(1,3,2), match(2,3,3), match(1,4,4), match(3,4,5),
    ];
    const before = JSON.stringify(matches);
    const view = make(matches);
    expect(view.rounds.map(r => r.round)).toEqual([1,2,3]);
    expect(view.rounds.map(r => r.matches.length)).toEqual([2,2,2]);
    expect(view.rounds.flatMap(r => r.sittingOut)).toEqual([]);
    expect(view.rounds[0].matches.map(m => m.id).sort()).toEqual(["1-2","3-4"]);
    const projected = view.rounds.flatMap(r => r.matches);
    for (const original of matches) expect(projected.find(m => m.id === original.id)).toMatchObject({
      a: original.a, b: original.b, score: original.score ?? null, winner: original.winner ?? null,
      date: original.date ?? null, time: original.time ?? null, court: original.court ?? null, playBy: original.playBy,
    });
    expect(view.totals.p2).toMatchObject({ wins: 1, gamesFor: 3, gamesAgainst: 0 });
    expect(JSON.stringify(matches)).toBe(before);
  });
  it("does not invent missing games or repair conflicting duplicate pairs", () => {
    const matches = [match(1,2,1),match(1,3,3),match(1,4,5)];
    expect(make(matches).rounds.map(r => r.round)).toEqual([1,3,5]);
    const duplicate = [...matches,match(2,3,3),match(2,4,5),{...match(1,2,5),id:"duplicate"}];
    expect(make(duplicate).rounds.map(r => r.round)).toEqual([1,3,5]);
  });
  it("preserves factual legacy labels when no stage count is supplied", () => {
    expect(buildRoundRobinView({ players, matches: [match(1,2,1),match(1,3,3),match(1,4,5)] }).rounds.map(r => r.round)).toEqual([1,3,5]);
  });
});