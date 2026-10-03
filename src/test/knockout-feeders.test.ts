import { describe, it, expect } from "vitest";
import { buildPlayoffChain, crossoverPairs } from "@/lib/smart-builder/playoff-chain";
import { knockoutFeeders, playoffDisplayStages } from "@/lib/tournaments/historical-pool-progress";

// Pools → QF → SF → Final with the two-pool top-4 crossover.
const main: any = { id: "main", order: 1, kind: "pools", pools: 2, poolSize: 4, name: "Pools", discipline: "singles" };
const plan = (name: string): any => ({ name, plan: { mode: "scheduled", date: "2026-10-22", pairing: "crossover", trigger: "manual" } });
const chain = buildPlayoffChain(main, "v1", [plan("Quarterfinals"), plan("Semifinals"), plan("Final")]);
const division = { stages: [main, ...chain.stages] };
const [qf, sf, fin] = chain.stages;

// QF bracket order (crossoverPairs): QF1 A1vB4, QF2 B2vA3, QF3 B1vA4, QF4 A2vB3.
const QF = [["A1", "B4"], ["B2", "A3"], ["B1", "A4"], ["A2", "B3"]];
const qfRows = (winners: Array<"a" | "b">) => QF.map(([a, b], i) => ({
  id: `qf${i + 1}`, stage_key: qf.id, bracket_position: i + 1, status: "completed",
  player_a_member_id: a, player_b_member_id: b, winner_member_id: winners[i] === "a" ? a : b,
}));
const sfPairs = (rows: any[]) => playoffDisplayStages(division, rows).find((s) => s.id === sf.id)!.matches
  .map((m) => [m.player_a_member_id, m.player_b_member_id]);

describe("fixed knockout feeder paths", () => {
  it("QF bracket is the two-pool crossover and never pairs same-pool players", () => {
    expect(chain.reason).toBeNull();
    expect(crossoverPairs(4).map(([a, b]) => `${"AB"[a[0]]}${a[1]}v${"AB"[b[0]]}${b[1]}`)).toEqual(["A1vB4", "B2vA3", "B1vA4", "A2vB3"]);
  });
  it("SF1 = W QF1 v W QF2, SF2 = W QF3 v W QF4; Final = W SF1 v W SF2", () => {
    expect(knockoutFeeders(sf)).toEqual([{ order: 1, a: 1, b: 2 }, { order: 2, a: 3, b: 4 }]);
    expect(knockoutFeeders(fin)).toEqual([{ order: 1, a: 1, b: 2 }]);
  });
  it.each([
    ["2+2", ["a", "a", "a", "a"], [["A1", "B2"], ["B1", "A2"]]],
    ["3B+1A", ["a", "a", "a", "b"], [["A1", "B2"], ["B1", "B3"]]],
    ["3B+1A (River 2 Men's A shape)", ["a", "a", "a", "b"].map((x, i) => (i === 0 ? "a" : x)) as any, [["A1", "B2"], ["B1", "B3"]]],
    ["4A+0B", ["a", "b", "b", "a"], [["A1", "A3"], ["A4", "A2"]]],
    ["4B+0A", ["b", "a", "a", "b"], [["B4", "B2"], ["B1", "B3"]]],
  ])("%s survivors: SF pairs come only from feeder positions", (_n, winners, expected) => {
    expect(sfPairs(qfRows(winners as any))).toEqual(expected);
  });
  it("undecided feeders show 'Winner QFn' and the slot fills once that QF is decided", () => {
    const rows = qfRows(["a", "a", "a", "a"]);
    rows[1] = { ...rows[1], status: "scheduled", winner_member_id: null as any };
    const m = playoffDisplayStages(division, rows).find((s) => s.id === sf.id)!.matches[0];
    expect(m.player_a_member_id).toBe("A1");
    expect(m.player_b_member_id).toBeNull();
    expect(m.feederB).toBe("Winner QF2");
  });
  it("QF cards say where their winner goes", () => {
    const q = playoffDisplayStages(division, qfRows(["a", "a", "a", "a"])).find((s) => s.id === qf.id)!;
    expect(q.matches.map((m) => m.feedsInto)).toEqual(["Semifinals 1", "Semifinals 1", "Semifinals 2", "Semifinals 2"]);
  });
  it("SF results feed the Final through fixed links", () => {
    const rows: any[] = [...qfRows(["a", "a", "a", "b"]),
      { id: "sf1", stage_key: sf.id, bracket_position: 1, status: "completed", player_a_member_id: "A1", player_b_member_id: "B2", winner_member_id: "B2" },
      { id: "sf2", stage_key: sf.id, bracket_position: 2, status: "completed", player_a_member_id: "B1", player_b_member_id: "B3", winner_member_id: "B1" }];
    const f = playoffDisplayStages(division, rows).find((s) => s.id === fin.id)!.matches[0];
    expect([f.player_a_member_id, f.player_b_member_id]).toEqual(["B2", "B1"]);
  });
});
