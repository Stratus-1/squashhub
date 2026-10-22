import { describe, expect, it } from "vitest";
import { hybridSwissTable, rrFinishRound } from "@/lib/tournaments/swiss-rr-finish";
import { buildProposedSwissGrid, buildSwissGrid, buildSwissProgression, type ProgressionMatchInput } from "@/lib/tournaments/swiss-progression-view";
import { swissRrDisplay } from "@/lib/tournaments/swiss-rr-display";
import { nextSwissRound, type SpecDivision } from "@/lib/tournaments/engine-service";

const seeds = Array.from({ length: 18 }, (_, i) => `p${i + 1}`);
const names = { p5: "Amelia Radebe", p6: "Hannelie Joubert", p7: "Sune Adams", p8: "Donique Pretorius", p10: "Megan Liebenberg", p11: "Tasha Hill" };
const finish = { enabled: true, groups: 2 };
const pairKey = (a: string, b: string) => [a, b].sort().join("|");
const match = (round: number, a: string, b: string, winner: string | null): ProgressionMatchInput => ({ id: `${round}-${a}-${b}`, round, a, b, winner, status: winner ? "completed" : "scheduled" });
const qualifying = [
  ...Array.from({ length: 9 }, (_, i) => match(1, seeds[i], seeds[i + 9], seeds[i])),
  ...[[1,9],[2,8],[3,7],[4,6],[5,10],[11,18],[12,17],[13,16],[14,15]].map(([a,b]) => match(2, `p${a}`, `p${b}`, `p${a}`)),
];
const modelOf = (matches: ProgressionMatchInput[]) => buildSwissProgression({ seedOrder: seeds, names, totalRounds: 5, tieBreaks: ["position_swap"], rrFinish: finish, matches });
const division = { divisionId: "g2", entrants: seeds.map((id, i) => ({ id, rank: i + 1 })), stages: [{ id: "s", kind: "swiss", order: 0, swissRounds: 5, rrFinish: finish, tieBreaks: ["position_swap"] }] } as unknown as SpecDivision;
const engineRows = (matches: ProgressionMatchInput[]) => matches.map((m) => ({ id: m.id, a: m.a, b: m.b, winner: m.winner, round: m.round, status: m.status, divisionId: "g2", stageId: "s", stageKind: "swiss" as const }));

describe("18-person hybrid: two fixed groups and ten dynamic Swiss players", () => {
  it("keeps A1–4/B5–8 labels while Swiss winners rerank only inside 9–18; saved R4 has no duplicate waiting slot", () => {
    const third = [
      ...rrFinishRound(seeds, 3, 2).pairs.map(([a,b]) => match(3, a, b, b)),
      ...[[9,10],[11,12],[13,14],[15,16],[17,18]].map(([a,b]) => match(3, `p${a}`, `p${b}`, `p${b}`)),
    ];
    const rows = [...qualifying, ...third];
    const fourth = nextSwissRound("test", division, "s", engineRows(rows)).map((f) => match(4, String(f.a), String(f.b), null));
    const model = modelOf([...rows, ...fourth]);
    const original = JSON.stringify(model);
    const grid = buildProposedSwissGrid(model).rounds.find((r) => r.round === 4);
    expect(grid?.blocks).toHaveLength(9);
    expect(grid?.blocks.flatMap((b) => b.rows.map((r) => r.pos)).sort((a,b) => Number(a)-Number(b))).toEqual(Array.from({ length: 18 }, (_,i) => i+1));
    const factual = buildSwissGrid(model).find((r) => r.round === 4);
    const labelled = new Map(factual?.blocks.flatMap((b) => b.rows.map((r) => [r.id, r.pos] as const)));
    expect(["p5","p6","p7","p8"].map((id) => labelled.get(id))).toEqual([5,6,7,8]);
    expect(labelled.get("p10")).toBe(9);
    expect(labelled.get("p11")).toBeGreaterThanOrEqual(9);
    const colors = swissRrDisplay(model, "riverside");
    expect(["p5","p6","p7","p8"].map((id) => colors.groupOf(id, 99))).toEqual([2,2,2,2]);
    expect(colors.groupOf("p10", 6)).toBe("swiss");
    expect(colors.groupOf("p11", 7)).toBe("swiss");
    expect(JSON.stringify(model)).toBe(original);
  });

  it("generates nine games per round with every player once, internal RR opponents once and no Swiss rematches", () => {
    const rows = [...qualifying];
    const rrSeen = new Set<string>();
    const swissSeen = new Set(qualifying.map((m) => pairKey(String(m.a), String(m.b))));
    for (const round of [3,4,5]) {
      const projected = buildProposedSwissGrid(modelOf(rows)).rounds.find((r) => r.round === round)?.blocks.filter((b) => b.rows.every((r) => r.id)).map((b) => pairKey(String(b.rows[0].id), String(b.rows[1].id))).sort();
      const games = nextSwissRound("test", division, "s", engineRows(rows));
      expect(games).toHaveLength(9);
      expect(new Set(games.flatMap((g) => [g.a,g.b])).size).toBe(18);
      expect(games.map((g) => pairKey(String(g.a),String(g.b))).sort()).toEqual(projected);
      games.forEach((g) => {
        const a=String(g.a), b=String(g.b), ai=seeds.indexOf(a), bi=seeds.indexOf(b), key=pairKey(a,b);
        if (ai < 8) {
          expect(Math.floor(ai/4)).toBe(Math.floor(bi/4));
          expect(rrSeen.has(key)).toBe(false); rrSeen.add(key);
        } else {
          expect(bi).toBeGreaterThanOrEqual(8);
          expect(swissSeen.has(key)).toBe(false); swissSeen.add(key);
        }
        rows.push(match(round, a, b, b));
      });
      const model = modelOf(rows);
      expect(model.rows.slice(0,8).map((r) => r.id)).toEqual(seeds.slice(0,8));
      expect(new Set(model.rows.slice(8).map((r) => r.id))).toEqual(new Set(seeds.slice(8)));
    }
    expect(rrSeen.size).toBe(12);
    expect(swissSeen.size).toBe(33); // 18 qualifying + 15 independent Swiss games
  });

  it("later group results cannot change remainder ranking or tie-breaks", () => {
    const thirds = rrFinishRound(seeds, 3, 2).pairs;
    const games = qualifying;
    const one = hybridSwissTable(seeds, [...games, ...thirds.map(([a,b]) => match(3,a,b,a))], finish);
    const two = hybridSwissTable(seeds, [...games, ...thirds.map(([a,b]) => match(3,a,b,b))], finish);
    expect(one.slice(8)).toEqual(two.slice(8));
    expect(hybridSwissTable(seeds, games, { enabled: false, groups: 2 })).toEqual(hybridSwissTable(seeds, games, undefined));
  });
});