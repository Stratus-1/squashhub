import { describe, it, expect } from "vitest";
import { perPoolQualifiers, nextStageFixtures, serializeSpec, type SpecDivision } from "@/lib/tournaments/engine-service";
import { contractIssues, perPoolSlots, type FixtureRow, type PlannedStage } from "@/lib/tournaments/contract";
import { defaultPoolPairs, planTransition, slotLabel, type StageTransition } from "@/lib/tournaments/transition";
import { DefinitionSchema, type TournamentDefinition } from "@/lib/smart-builder/definition";
import { presetDefinition } from "@/lib/smart-builder/quick-path";
import { addStage, setDiscipline, transitionText } from "@/lib/smart-builder/stage-builder";
import { addDivision } from "@/lib/smart-builder/division-structure";
import { specFromDefinition } from "@/lib/tournaments/structured-persist";

const pools: PlannedStage = { id: "S1", order: 0, kind: "pools", name: "Pools", pools: 4, poolSize: 4, schedule: { rule: "fixed", date: "2026-10-01" } };
const P = (pool: number, n: number) => `p${pool}${n}`; // p{pool}{seed}
/** Every pool round robin; lower seed number wins unless `upset` flips a specific game. */
function poolRows(div = "D", upset?: (a: string, b: string) => boolean, skip?: (a: string, b: string) => boolean): FixtureRow[] {
  const rows: FixtureRow[] = [];
  for (let pl = 1; pl <= 4; pl++) for (let i = 1; i <= 4; i++) for (let j = i + 1; j <= 4; j++) {
    const a = P(pl, i), b = P(pl, j);
    const done = !skip?.(a, b);
    rows.push({ divisionId: div, stageId: "S1", stageKind: "pools", pool: pl, round: 1, a, b, status: done ? "completed" : "scheduled", winner: done ? (upset?.(a, b) ? b : a) : null });
  }
  return rows;
}
const L = (id: string) => `${"ABCD"[Number(id[1]) - 1]}`;

describe("per-pool qualification", () => {
  it("1. 4 pools × top 2 = exactly 8 stable slots", () => {
    const s = perPoolSlots(pools, 2);
    expect(s).toHaveLength(8);
    expect(s.every((x) => x.sourceStageId === "S1")).toBe(true);
    expect(s.map((x) => `${x.poolIndex}:${x.position}`)).toEqual(["0:1", "1:1", "2:1", "3:1", "0:2", "1:2", "2:2", "3:2"]);
  });
  it("2 + 6. slots resolve from each pool's own table, never a combined ranking", () => {
    // Pool B: seed 4 wins everything → B1 = p24 even though combined "seed order" would never pick it.
    const q = perPoolQualifiers(pools, poolRows("D", (a, b) => b === "p24"), 2);
    const byLabel = Object.fromEntries(q.map((x) => [`${"ABCD"[x.poolIndex]}${x.position}`, x.id]));
    expect(byLabel).toMatchObject({ A1: "p11", A2: "p12", B1: "p24", B2: "p21", C1: "p31", D2: "p42" });
    expect(q.every((x) => L(x.id) === "ABCD"[x.poolIndex])).toBe(true);
  });
  it("3 + 4. A↔D/B↔C and A↔B/C↔D mappings", () => {
    const t = (pp: Array<[number, number]>): StageTransition => ({ sourceStageId: "S1", destinationStageId: "KO", positions: [1, 2], method: "cross_pool", poolPairs: pp, pairing: "winner_runner_up" });
    const s = (pp: Array<[number, number]>) => planTransition(t(pp), 4).map((p) => `${slotLabel(p.a)}-${slotLabel(p.b)}`.replace(/Pool | #/g, ""));
    expect(s([[0, 3], [1, 2]])).toEqual(["A1-D2", "D1-A2", "B1-C2", "C1-B2"]);
    expect(s(defaultPoolPairs(4))).toEqual(["A1-B2", "B1-A2", "C1-D2", "D1-C2"]);
  });
  it("5. renaming pools never changes slot identity", () => {
    const t: StageTransition = { sourceStageId: "S1", destinationStageId: "KO", positions: [1, 2], method: "cross_pool", poolPairs: [[0, 3], [1, 2]], pairing: "winner_runner_up" };
    const a = planTransition(t, 4), b = planTransition(t, 4);
    expect(a.map((p) => slotLabel(p.a, ["Red", "Blue", "Green", "Gold"]))).toEqual(["Red #1", "Gold #1", "Blue #1", "Green #1"]);
    expect(a).toEqual(b);
  });
  it("7. a tie on the qualifying line blocks (same rule as play-offs)", () => {
    // Pool A: p12, p13, p14 each win once → 3-way tie for 2nd.
    const rows = poolRows("D", (a, b) => (a === "p12" && b === "p13") || (a === "p13" && b === "p14") || (a === "p12" && b === "p14" && false) ? true : false);
    const tieRows = rows.map((r) => r.pool === 1 && r.a === "p12" && r.b === "p14" ? { ...r, winner: "p14" } : r);
    expect(() => perPoolQualifiers(pools, tieRows, 2)).toThrow(/tie/);
  });
  it("8. unfinished pools resolve nothing", () => {
    expect(() => perPoolQualifiers(pools, poolRows("D", undefined, (a, b) => a === "p31" && b === "p34"), 2)).toThrow(/not finished/);
  });
  it("9. no participant fills two slots; N larger than a pool is refused", () => {
    const q = perPoolQualifiers(pools, poolRows(), 2);
    expect(new Set(q.map((x) => x.id)).size).toBe(8);
    expect(() => perPoolQualifiers(pools, poolRows(), 5)).toThrow(/only 4/);
  });
  const spec = (s2: Partial<PlannedStage>): SpecDivision => ({
    divisionId: "D", label: "Men", unit: "individual", expectedEntrants: 16,
    entrants: Array.from({ length: 16 }, (_, i) => ({ id: P(Math.floor(i / 4) + 1, (i % 4) + 1), rank: i + 1 })),
    stages: [pools, { id: "S2", order: 1, kind: "round_robin", name: "Next", generation: "automatic", schedule: { rule: "fixed", date: "2026-10-02" }, ...s2 } as PlannedStage],
  } as any);
  it("10. rows from another division never leak in", () => {
    const d = spec({ progression: { mode: "top_n", perPool: true, top: 2, standings: "reset" } });
    const rows = [...poolRows("D"), ...poolRows("OTHER", () => true).map((r) => ({ ...r, a: r.a!.replace("p", "x"), b: r.b!.replace("p", "x"), winner: r.b!.replace("p", "x") }))];
    const plan = nextStageFixtures("t", d, "S2", rows, { ownerConfirmed: true });
    expect(plan.entrants.map((e) => e.id).every((id) => id.startsWith("p"))).toBe(true);
    expect(plan.entrants).toHaveLength(8);
  });
  it("13. singles pools → top 2 each → doubles still needs a pair rule; then pairs the 8 qualifiers", () => {
    const d = spec({ discipline: "doubles", progression: { mode: "top_n", perPool: true, top: 2, standings: "reset" } });
    expect(contractIssues(d).map((i) => i.code)).toContain("pairs_model");
    expect(() => nextStageFixtures("t", d, "S2", poolRows(), { ownerConfirmed: true })).toThrow();
    const ok = spec({ discipline: "doubles", progression: { mode: "top_n", perPool: true, top: 2, standings: "reset", pairing: "positions" } });
    const plan = nextStageFixtures("t", ok, "S2", poolRows(), { ownerConfirmed: true });
    expect(plan.entrants.map((e) => e.id)).toEqual(["p11+p21", "p31+p41", "p12+p22", "p32+p42"]);
  });
  it("validation: N above pool size and per-pool without pools are blocked", () => {
    expect(contractIssues(spec({ progression: { mode: "top_n", perPool: true, top: 5, standings: "reset" } })).map((i) => i.code)).toContain("top_exceeds_pool");
    const d = spec({ progression: { mode: "top_n", perPool: true, top: 2, standings: "reset" } });
    d.stages[0] = { ...pools, kind: "round_robin", pools: undefined };
    expect(contractIssues(d).map((i) => i.code)).toContain("per_pool_source");
  });
});

describe("per-pool qualification in the builder", () => {
  const build = () => {
    const def = presetDefinition("custom"); const d = def.divisions[0]; d.name = "Men";
    const s1 = d.sections[0].stages[0]; s1.groups = 4; s1.input.entrants = 16;
    addStage(d); const s2 = d.sections[0].stages[1];
    s2.progression = { mode: "top_n", perPool: true, top: 2, standings: "reset" };
    return { def, s1, s2 };
  };
  it("map shows top 2 from each pool (8 qualifiers)", () => {
    const { s1, s2 } = build();
    expect(transitionText(s1, s2)).toContain("top 2 from each pool (8 qualifiers)");
  });
  it("11. copying a division carries the rule onto the new division's own stages", () => {
    const { def } = build();
    addDivision(def, "Ladies", { copyFromId: def.divisions[0].id });
    const [m, l] = def.divisions.map((d) => d.sections[0].stages);
    expect(l[1].progression).toEqual(m[1].progression);
    expect(l[1].input.fromStageId).toBe(l[0].id);
    expect(l[0].id).not.toBe(m[0].id);
    const sp = specFromDefinition(def);
    expect(sp.divisions[1].stages[1].progression).toMatchObject({ perPool: true, top: 2 });
  });
  it("12. autosave/reload keeps per-pool rules and mappings", () => {
    const { def } = build();
    addStage(def.divisions[0], "knockout");
    const ko = def.divisions[0].sections[0].stages[2];
    ko.qualifierTransition = { positions: [1, 2], method: "cross_pool", poolPairs: [[0, 3], [1, 2]], pairing: "winner_runner_up" } as any;
    const back = DefinitionSchema.parse(JSON.parse(JSON.stringify(def)));
    expect(back.divisions[0].sections[0].stages[1].progression).toEqual(def.divisions[0].sections[0].stages[1].progression);
    expect(back.divisions[0].sections[0].stages[2].qualifierTransition?.poolPairs).toEqual([[0, 3], [1, 2]]);
  });
  it("14. rebuilding the spec leaves qualifier rules unchanged", () => {
    const { def } = build();
    const a = serializeSpec(specFromDefinition(def));
    const b = serializeSpec(JSON.parse(JSON.stringify(a)));
    expect(b.divisions[0].stages[1].progression).toEqual(a.divisions[0].stages[1].progression);
  });
  it("switching a doubles stage in does not drop the per-pool rule", () => {
    const { def, s2 } = build();
    setDiscipline(def.divisions[0], s2.id, "doubles");
    expect(def.divisions[0].sections[0].stages[1].progression).toMatchObject({ perPool: true, top: 2 });
  });
});
