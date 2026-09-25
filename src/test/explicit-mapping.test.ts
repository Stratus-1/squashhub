import { describe, it, expect } from "vitest";
import { generateStructuredTournament, specFromDefinition, startNextStructuredStage, type Db } from "@/lib/tournaments/structured-persist";
import { serializeSpec } from "@/lib/tournaments/engine-service";
import { deriveMapping, formatMapping, mappingIssues, parseMapping, resolveMapping, seedPools } from "@/lib/tournaments/mapping";
import { DefinitionSchema } from "@/lib/smart-builder/definition";
import { presetDefinition } from "@/lib/smart-builder/quick-path";
import { diamondTemplate } from "@/lib/smart-builder/stage-builder";
import { engineVerdicts } from "@/lib/smart-builder/engine-support";
import { effectiveMapping, stageMappingLines } from "@/lib/smart-builder/matchups";

/** In-memory DB that mirrors the guard_structured_match_identity trigger. */
function fakeDb() {
  const t: Record<string, any[]> = {};
  let n = 0;
  const match = (r: any, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
  const guard = (m: any) => {
    const tour = t.tournaments.find((x) => x.id === m.champ_id);
    if (tour.builder_architecture !== "structured") return;
    if (!m.division_id || !m.stage_id || !m.round_id) throw new Error("identity");
    const st = t.tournament_stages.find((x) => x.id === m.stage_id);
    if (st.division_id !== m.division_id) throw new Error("stage/division");
    const rd = t.club_champs_rounds.find((x) => x.id === m.round_id);
    if (rd.stage_id !== m.stage_id) throw new Error("round/stage");
    if (["knockout", "placement"].includes(st.kind) && m.pool_id) throw new Error("ko pool");
    if (st.kind === "pools" && (!m.pool_id || t.tournament_pools.find((p) => p.id === m.pool_id).stage_id !== m.stage_id)) throw new Error("pool");
  };
  const db: Db = {
    async insert(table, rows) {
      const out = rows.map((r) => ({ id: `${table}-${++n}`, ...r }));
      if (table === "club_champs_matches") out.forEach(guard);
      if (table === "club_champs_rounds") out.forEach((r: any) => {
        if (!["knockout", "semi_final", "final", "third_place", "round_robin", "swiss"].includes(r.round_type)) throw new Error("round_type check");
        if (!["pending", "active", "complete"].includes(r.status)) throw new Error("round status check");
      });
      (t[table] ??= []).push(...out);
      return out;
    },
    async select(table, f) { return (t[table] ?? []).filter((r) => match(r, f)); },
    async update(table, f, patch) { (t[table] ?? []).filter((r) => match(r, f)).forEach((r) => Object.assign(r, patch)); },
    async remove(table, ids) {
      for (const id of ids) {
        const r = (t[table] ?? []).find((x) => x.id === id);
        if (table === "club_champs_matches" && r?.winner_member_id) throw new Error("played game cannot be removed");
      }
      t[table] = (t[table] ?? []).filter((x) => !ids.includes(x.id));
    },
  };
  return { db, t };
}


const base = { source: "seed_pools" as const, pools: 2, poolSize: 4, discipline: "singles" as const };

describe("explicit matchup mapping (source → sides → who plays whom)", () => {
  it("expresses any singles pattern — A1 v B1, A1 v B2, A2 v B1 — and round-trips as text", () => {
    const { mapping, errors } = parseMapping("R1: A1 v B2\nR1: A2 v B1\nR2: A1 v B1", base);
    expect(errors).toEqual([]);
    expect(mapping!.matches.map((m) => `${m.round}:${m.a} v ${m.b}`)).toEqual(["1:A1 v B2", "1:A2 v B1", "2:A1 v B1"]);
    expect(mappingIssues(mapping, "S")).toEqual([]);
    expect(formatMapping(mapping!)).toBe("R1: A1 v B2\nR1: A2 v B1\nR2: A1 v B1");
    const pools = seedPools([1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ id: `p${i}`, rank: i })), 2, "snake");
    expect(resolveMapping(mapping!, pools).map((m) => `${m.aId} v ${m.bId}`)).toEqual([`${pools[0][0]} v ${pools[1][1]}`, `${pools[0][1]} v ${pools[1][0]}`, `${pools[0][0]} v ${pools[1][0]}`]);
  });

  it("rejects a player twice in one round, positions beyond the pool, and a position in two pairs", () => {
    expect(mappingIssues(parseMapping("R1: A1 v B1\nR1: A1 v B2", base).mapping).join()).toMatch(/A1 is in two games/);
    expect(mappingIssues(parseMapping("R1: A5 v C1", base).mapping).join()).toMatch(/4 positions.*no pool C|no pool C|4 positions/);
    const dbl = { ...base, discipline: "doubles" as const };
    expect(mappingIssues(parseMapping("R1: A1+B1 v A3+B3\nR2: A1+B2 v A2+B3", dbl).mapping).join()).toMatch(/in two pairs/);
    expect(mappingIssues(parseMapping("R1: A1 v B1", dbl).mapping).join()).toMatch(/need 2 positions/);
  });

  it("derives position-to-position ties from pool rotation (proposal only)", () => {
    const m = deriveMapping({ pools: 4, poolSize: 2, discipline: "doubles", games: [{ positions: [1, 2], opponent: [1, 2] }] });
    expect(new Set(m.matches.map((x) => x.round)).size).toBe(3);
    expect(m.matches.filter((x) => x.round === 1)).toHaveLength(2);
    expect(m.units.every((u) => u.slots[0].pool === u.slots[1].pool)).toBe(true);
    expect(mappingIssues(m)).toEqual([]);
  });

  it("doubles pairs formed ACROSS pools from finishing positions (A1+B1 v A3+B3), generated by the engine", async () => {
    const def = presetDefinition("custom");
    const d = def.divisions[0];
    d.sections[0].stages = [
      { id: "rr", name: "Singles pools", kind: "round_robin", discipline: "singles", groups: 2, groupSize: 4, input: { entrants: 8 }, advance: { role: "none" }, schedule: { mode: "fixed", startDate: "2026-10-01", roundDates: ["2026-10-01", "2026-10-02", "2026-10-03"] } } as any,
      { id: "dx", name: "Doubles", kind: "cross_pool_league", discipline: "doubles", groups: 2, groupSize: 4, input: { fromStageId: "rr" }, advance: { role: "none" }, generation: "automatic",
        schedule: { mode: "fixed", startDate: "2026-10-08", roundDates: ["2026-10-08"] },
        mapping: parseMapping("R1: A1+B1 v A3+B3\nR1: A2+B2 v A4+B4", { source: "stage_standings", sourceStageId: "rr", pools: 2, poolSize: 4, discipline: "doubles" }).mapping } as any,
    ];
    const parsed = DefinitionSchema.parse(def);
    expect(engineVerdicts(parsed).every((v) => v.state === "supported")).toBe(true);
    expect(stageMappingLines(parsed, parsed.divisions[0].sections[0].stages[1]).join("\n")).toMatch(/finishing positions in Singles pools[\s\S]*Pair 1 = A1 \+ B1[\s\S]*A1\+B1 v A3\+B3/);
    const spec = specFromDefinition(parsed);
    expect(spec.divisions[0].stages[1].kind).toBe("mapped");
    const env = fakeDb();
    env.t.tournaments = [{ id: "t", builder_architecture: "structured", builder_spec: serializeSpec(spec) }];
    env.t.club_champs_entries = Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, champ_id: "t", club_member_id: `p${i + 1}`, group_number: 1, order_index: i }));
    await generateStructuredTournament(env.db, "t");
    expect(env.t.club_champs_matches.every((m: any) => m.stage_key === "rr")).toBe(true); // waits for results
    await expect(startNextStructuredStage(env.db, "t", d.id, "dx", { ownerConfirmed: true })).rejects.toThrow(/not finished/);
    for (const m of env.t.club_champs_matches) m.winner_member_id = Number(m.player_a_member_id.slice(1)) < Number(m.player_b_member_id.slice(1)) ? m.player_a_member_id : m.player_b_member_id, m.status = "completed";
    await startNextStructuredStage(env.db, "t", d.id, "dx", { ownerConfirmed: true });
    const dbl = env.t.club_champs_matches.filter((m: any) => m.stage_key === "dx");
    // Snake pools: A = p1,p4,p5,p8 · B = p2,p3,p6,p7; lower seed always wins → finishing order = seed order.
    expect(dbl.map((m: any) => `${m.player_a_member_id}+${m.partner_a_member_id} v ${m.player_b_member_id}+${m.partner_b_member_id}`)).toEqual(["p1+p2 v p5+p6", "p4+p3 v p8+p7"]);
    expect(dbl.every((m: any) => m.pool_id == null && m.stage_label)).toBe(true);
  });

  it("Diamond: singles and same-evening positional doubles run as explicit matchups, generated up front", () => {
    const def = presetDefinition("custom"); diamondTemplate(def);
    const d = def.divisions[0];
    const [sg, db] = d.sections[0].stages;
    expect(engineVerdicts(def).filter((v) => v.stageId === sg.id || v.stageId === db.id).map((v) => v.state)).toEqual(["supported", "supported"]);
    const ms = effectiveMapping(d, sg)!, md = effectiveMapping(d, db)!;
    expect(ms.source).toBe("seed_pools"); expect(md.source).toBe("seed_pools");
    expect(md.units.every((u) => u.slots.length === 2 && u.slots[0].pool === u.slots[1].pool)).toBe(true);
    const lines = stageMappingLines(def, db).join("\n");
    expect(lines).toMatch(/Pairs: Pair 1 = A1 \+ A2/);
    expect(lines).toMatch(/Round 1.*A1\+A2 v D1\+D2/);
  });
});
