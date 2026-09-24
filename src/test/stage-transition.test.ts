import { describe, it, expect, beforeEach } from "vitest";
import {
  defaultPoolPairs, planTransition, possiblePoolPairings, qualifierSlots, resolveTransition, slotLabel, transitionIssues,
  type StageTransition,
} from "@/lib/tournaments/transition";
import { previewPlayoffs, previewTransition, confirmPlayoffs, serializeSpec, type SpecDivision } from "@/lib/tournaments/engine-service";
import type { PlannedStage, PoolStanding } from "@/lib/tournaments/contract";
import {
  confirmStructuredPlayoffs, generateStructuredTournament, previewStructuredPlayoffs, specFromDefinition, type Db,
} from "@/lib/tournaments/structured-persist";
import { DefinitionSchema } from "@/lib/smart-builder/definition";

/* ───────── pure mapping ───────── */

const tr = (p: Partial<StageTransition> = {}): StageTransition => ({
  sourceStageId: "pools", destinationStageId: "ko", positions: [1, 2], method: "cross_pool",
  poolPairs: defaultPoolPairs(4), pairing: "winner_runner_up", ...p,
});
const shown = (t: StageTransition, poolCount = 4) => planTransition(t, poolCount).map((p) => `${slotLabel(p.a)} vs ${slotLabel(p.b)}`);

describe("cross-pool mapping", () => {
  it("4 pools, top 2, A↔B and C↔D", () => {
    expect(shown(tr())).toEqual([
      "Pool A #1 vs Pool B #2", "Pool B #1 vs Pool A #2",
      "Pool C #1 vs Pool D #2", "Pool D #1 vs Pool C #2",
    ]);
  });

  it("4 pools, top 2, A↔D and B↔C", () => {
    expect(shown(tr({ poolPairs: [[0, 3], [1, 2]] }))).toEqual([
      "Pool A #1 vs Pool D #2", "Pool D #1 vs Pool A #2",
      "Pool B #1 vs Pool C #2", "Pool C #1 vs Pool B #2",
    ]);
  });

  it("same-position pairing gives cross-pool placement matches (A1 v D1, A2 v D2…)", () => {
    expect(shown(tr({ poolPairs: [[0, 3], [1, 2]], pairing: "same_position", positions: [1, 2, 3] }))).toEqual([
      "Pool A #1 vs Pool D #1", "Pool A #2 vs Pool D #2", "Pool A #3 vs Pool D #3",
      "Pool B #1 vs Pool C #1", "Pool B #2 vs Pool C #2", "Pool B #3 vs Pool C #3",
    ]);
  });

  it("a Plate stage can take positions 3–4 only", () => {
    expect(shown(tr({ positions: [3, 4], poolPairs: [[0, 1], [2, 3]] }))).toEqual([
      "Pool A #3 vs Pool B #4", "Pool B #3 vs Pool A #4",
      "Pool C #3 vs Pool D #4", "Pool D #3 vs Pool C #4",
    ]);
  });

  it("rejects a pairing that does not cover every pool exactly once", () => {
    expect(transitionIssues(tr({ poolPairs: [[0, 1], [1, 2]] }), 4).some((i) => i.level === "error")).toBe(true);
    expect(transitionIssues(tr({ poolPairs: [[0, 0], [2, 3]] }), 4).some((i) => i.code === "pair_self")).toBe(true);
    expect(() => planTransition(tr({ poolPairs: [] }), 4)).toThrow();
  });

  it("offers every valid crossing of 4 pools", () => {
    expect(possiblePoolPairings(4)).toHaveLength(3);
  });
});

describe("overall reseed", () => {
  it("8 qualifiers are reseeded into the canonical bracket, ignoring source pools", () => {
    expect(shown(tr({ method: "reseed", poolPairs: undefined, pairing: undefined }))).toEqual([
      "Pool A #1 vs Pool D #2", "Pool D #1 vs Pool A #2",
      "Pool B #1 vs Pool C #2", "Pool C #1 vs Pool B #2",
    ]);
    expect(qualifierSlots(tr(), 4)).toHaveLength(8);
  });
});

describe("manual mapping", () => {
  it("uses the owner's explicit slot map and refuses a place used twice", () => {
    const t = tr({ method: "manual", manualSlots: [[{ poolIndex: 0, position: 1 }, { poolIndex: 2, position: 2 }]] });
    expect(shown(t)).toEqual(["Pool A #1 vs Pool C #2"]);
    const dup = tr({ method: "manual", manualSlots: [[{ poolIndex: 0, position: 1 }, { poolIndex: 2, position: 2 }], [{ poolIndex: 0, position: 1 }, { poolIndex: 3, position: 2 }]] });
    expect(transitionIssues(dup, 4).some((i) => i.code === "manual_dup")).toBe(true);
  });
});

describe("slot resolution", () => {
  const standings = (div = "men"): PoolStanding[] =>
    [0, 1, 2, 3].flatMap((p) => [1, 2, 3].map((position) => ({ pool: p + 1, position, id: `p${p}${position}`, divisionId: div })));

  it("a winner/runner-up slot resolves only from its own pool and position", () => {
    const r = resolveTransition(planTransition(tr(), 4), standings(), "men");
    expect(r[0]).toMatchObject({ aId: "p01", bId: "p12" });
    expect(r[3]).toMatchObject({ aId: "p31", bId: "p22" });
  });

  it("mapping cannot cross divisions", () => {
    expect(() => resolveTransition(planTransition(tr(), 4), [...standings(), ...standings("ladies")], "men")).toThrow(/another division/);
  });

  it("a participant can never occupy two destination places", () => {
    const bad = standings().map((s) => (s.pool === 2 && s.position === 2 ? { ...s, id: "p01" } : s));
    expect(() => resolveTransition(planTransition(tr(), 4), bad, "men")).toThrow(/two places/);
  });
});

/* ───────── through the engine, on a spec ───────── */

const poolStage: PlannedStage = { id: "pools", order: 0, kind: "pools", name: "Pools", pools: 4, poolSize: 3, schedule: { rule: "fixed", date: "2026-10-01" } };
const koStage = (t?: StageTransition): PlannedStage => ({
  id: "ko", order: 1, kind: "knockout", name: "Knockout", generation: "owner_approval",
  schedule: { rule: "play_by", deadline: "2026-10-10" },
  qualify: { perPool: 2, mapping: "cross_pool", transition: t ?? null },
});
const division = (t?: StageTransition, poolLabels?: string[]): SpecDivision => ({
  divisionId: "men", label: "Men", unit: "players", expectedEntrants: 12,
  seeding: { source: "entry_order", method: "snake" }, placements: "champion", poolLabels,
  stages: [poolStage, koStage(t)], entrants: Array.from({ length: 12 }, (_, i) => ({ id: `m${i + 1}`, rank: i + 1 })),
});
const fullStandings = (): PoolStanding[] => [0, 1, 2, 3].flatMap((p) => [1, 2, 3].map((position) => ({ pool: p + 1, position, id: `m${p * 3 + position}`, divisionId: "men" })));

describe("engine preview", () => {
  it("shows qualifier slots before results and real players afterwards", () => {
    const d = division(tr());
    const before = previewTransition(d, "ko");
    expect(before.slots.map((s) => slotLabel(s.a))).toEqual(["Pool A #1", "Pool B #1", "Pool C #1", "Pool D #1"]);
    const after = previewPlayoffs(d, "ko", fullStandings(), []);
    expect(after.ok).toBe(true);
    expect(after.resolved).toBe(true);
    expect(after.qualifiers[0]).toMatchObject({ a: "m1", b: "m5", aSlot: { poolIndex: 0, position: 1 }, bSlot: { poolIndex: 1, position: 2 } });
  });

  it("an incomplete pool blocks the preview and keeps the slots visible", () => {
    const partial = fullStandings().filter((s) => !(s.pool === 3 && s.position === 2));
    const p = previewPlayoffs(division(tr()), "ko", partial, []);
    expect(p.ok).toBe(false);
    expect(p.resolved).toBe(false);
    expect(p.slots).toHaveLength(4);
    expect(() => confirmPlayoffs("t", division(tr()), p, { ownerConfirmed: true, existing: [] })).toThrow();
  });

  it("renaming pools does not change the stored mapping", () => {
    const t = tr({ poolPairs: [[0, 3], [1, 2]] });
    const plain = previewPlayoffs(division(t), "ko", fullStandings(), []);
    const renamed = previewPlayoffs(division(serializeSpec({ divisions: [] } as any) ? t : t, ["Red", "Green", "Blue", "Gold"]), "ko", fullStandings(), []);
    expect(renamed.qualifiers.map((q) => [q.a, q.b])).toEqual(plain.qualifiers.map((q) => [q.a, q.b]));
    expect(slotLabel(renamed.qualifiers[0].aSlot, renamed.poolLabels)).toBe("Red #1");
    expect(renamed.transition?.poolPairs).toEqual([[0, 3], [1, 2]]);
  });

  it("withdrawal before confirmation revalidates the preview", () => {
    const short = fullStandings().filter((s) => s.id !== "m5"); // Pool B runner-up withdrew
    const p = previewPlayoffs(division(tr()), "ko", short, []);
    expect(p.ok).toBe(false);
    expect(p.qualifiers[0].b).toBeNull();
  });
});

/* ───────── persisted path ───────── */

function fakeDb() {
  const t: Record<string, any[]> = {};
  let n = 0;
  const match = (r: any, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
  const db: Db = {
    async insert(table, rows) {
      const out = rows.map((r) => ({ id: `${table}-${++n}`, ...r }));
      if (table === "club_champs_matches") out.forEach((m: any) => {
        const st = t.tournament_stages.find((x) => x.id === m.stage_id);
        if (["knockout", "placement"].includes(st.kind) && m.pool_id) throw new Error("knockout fixture may not belong to a pool");
        if (st.division_id !== m.division_id) throw new Error("division isolation");
      });
      (t[table] ??= []).push(...out);
      return out;
    },
    async select(table, f) { return (t[table] ?? []).filter((r) => match(r, f)); },
    async update(table, f, patch) { (t[table] ?? []).filter((r) => match(r, f)).forEach((r) => Object.assign(r, patch)); },
    async remove(table, ids) { t[table] = (t[table] ?? []).filter((x) => !ids.includes(x.id)); },
  };
  return { db, t };
}

const def = (transition: any) => DefinitionSchema.parse({
  name: "Cross-pool championships",
  divisions: [{
    id: "men", name: "Men", poolLabels: ["Pool A", "Pool B", "Pool C", "Pool D"],
    sections: [{ id: "s", name: "Main", stages: [
      { id: "pools", name: "Pools", kind: "round_robin", groups: 4, groupSize: 3, input: { entrants: 12 }, advance: { role: "qualify", perGroup: 2 }, schedule: { mode: "fixed", roundDates: ["2026-10-03"] } },
      { id: "ko", name: "Quarter-finals", kind: "knockout", groups: 1, groupSize: 8, input: { fromStageId: "pools" }, qualifierMapping: "cross_pool", qualifierTransition: transition, generation: "owner_approval", schedule: { mode: "play_by", endDate: "2026-10-20" } },
    ] }],
  }],
});

describe("persisted cross-pool transition", () => {
  let env: ReturnType<typeof fakeDb>;
  const TID = "t1";
  const setup = async (transition: any) => {
    env = fakeDb();
    env.t.tournaments = [{ id: TID, builder_architecture: "structured", builder_spec: specFromDefinition(def(transition)) }];
    env.t.club_champs_entries = Array.from({ length: 12 }, (_, i) => ({ id: `e${i + 1}`, champ_id: TID, club_member_id: `m${i + 1}`, group_number: 1, order_index: i }));
    await generateStructuredTournament(env.db, TID);
    // stronger seed wins every pool game
    env.t.club_champs_matches.filter((m: any) => m.pool_id).forEach((m: any) => {
      const a = Number(m.player_a_member_id.slice(1)), b = Number(m.player_b_member_id.slice(1));
      Object.assign(m, { status: "completed", score: "3-0", winner_member_id: a < b ? m.player_a_member_id : m.player_b_member_id });
    });
  };
  beforeEach(() => { env = fakeDb(); });

  it("A↔B / C↔D is persisted and used, with NULL pool on every knockout game", async () => {
    await setup({ positions: [1, 2], method: "cross_pool", poolPairs: [[0, 1], [2, 3]], pairing: "winner_runner_up" });
    const p = await previewStructuredPlayoffs(env.db, TID, "men", "ko");
    expect(p.ok).toBe(true);
    expect(p.slots.map((s) => `${slotLabel(s.a, p.poolLabels)} vs ${slotLabel(s.b, p.poolLabels)}`)).toEqual([
      "Pool A #1 vs Pool B #2", "Pool B #1 vs Pool A #2", "Pool C #1 vs Pool D #2", "Pool D #1 vs Pool C #2",
    ]);
    const created = await confirmStructuredPlayoffs(env.db, TID, "men", "ko", true);
    expect(created).toHaveLength(4);
    expect(created.every((c: any) => c.pool_id === null)).toBe(true);
    const stage = env.t.tournament_stages.find((s: any) => s.spec_key === "ko");
    expect(stage.config.transition.poolPairs).toEqual([[0, 1], [2, 3]]);
    expect(stage.config.transition.source_stage_id).toBe(env.t.tournament_stages.find((s: any) => s.spec_key === "pools").id);
  });

  it("A↔D / B↔C produces a different, owner-chosen bracket", async () => {
    await setup({ positions: [1, 2], method: "cross_pool", poolPairs: [[0, 3], [1, 2]], pairing: "winner_runner_up" });
    const p = await previewStructuredPlayoffs(env.db, TID, "men", "ko");
    expect(p.slots.map((s) => `${slotLabel(s.a, p.poolLabels)} vs ${slotLabel(s.b, p.poolLabels)}`)).toEqual([
      "Pool A #1 vs Pool D #2", "Pool D #1 vs Pool A #2", "Pool B #1 vs Pool C #2", "Pool C #1 vs Pool B #2",
    ]);
  });

  it("confirmed play-offs cannot be remapped or regenerated", async () => {
    await setup({ positions: [1, 2], method: "cross_pool", poolPairs: [[0, 1], [2, 3]], pairing: "winner_runner_up" });
    await confirmStructuredPlayoffs(env.db, TID, "men", "ko", true);
    await expect(confirmStructuredPlayoffs(env.db, TID, "men", "ko", true)).rejects.toThrow();
    const spec = env.t.tournaments[0].builder_spec;
    spec.divisions[0].stages[1].qualify.transition.poolPairs = [[0, 3], [1, 2]];
    const p = await previewStructuredPlayoffs(env.db, TID, "men", "ko");
    expect(p.ok).toBe(false); // the stage already exists — no silent remap
  });

  it("before pool results the preview shows slots and refuses to confirm", async () => {
    env = fakeDb();
    env.t.tournaments = [{ id: TID, builder_architecture: "structured", builder_spec: specFromDefinition(def({ positions: [1, 2], method: "cross_pool", poolPairs: [[0, 1], [2, 3]], pairing: "winner_runner_up" })) }];
    env.t.club_champs_entries = Array.from({ length: 12 }, (_, i) => ({ id: `e${i + 1}`, champ_id: TID, club_member_id: `m${i + 1}`, group_number: 1, order_index: i }));
    await generateStructuredTournament(env.db, TID);
    const p = await previewStructuredPlayoffs(env.db, TID, "men", "ko");
    expect(p.ok).toBe(false);
    expect(p.slots).toHaveLength(4);
    expect(p.qualifiers.every((q) => q.a === null && q.b === null)).toBe(true);
    await expect(confirmStructuredPlayoffs(env.db, TID, "men", "ko", true)).rejects.toThrow();
  });
});
