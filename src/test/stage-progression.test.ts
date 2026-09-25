import { describe, it, expect } from "vitest";
import { generateStructuredTournament, specFromDefinition, type Db } from "@/lib/tournaments/structured-persist";
import { serializeSpec } from "@/lib/tournaments/engine-service";
import { parseMapping } from "@/lib/tournaments/mapping";
import { autoProgress, checkDeferredSetup, decidePositionOrder, setupDeferredStage, setupOk, stageLifecycle } from "@/lib/tournaments/progression";
import { DefinitionSchema } from "@/lib/smart-builder/definition";
import { presetDefinition } from "@/lib/smart-builder/quick-path";

/** In-memory DB mirroring the identity trigger AND guard_structured_stage_round_once (one insert call = one transaction). */
function fakeDb() {
  const t: Record<string, any[]> = {};
  let n = 0;
  const match = (r: any, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
  const db: Db = {
    async insert(table, rows) {
      const out = rows.map((r) => ({ id: `${table}-${++n}`, ...r }));
      if (table === "club_champs_matches") for (const m of out as any[]) {
        if (!m.division_id || !m.stage_id || !m.round_id) throw new Error("identity");
        if ((t.club_champs_matches ?? []).some((x) => x.stage_id === m.stage_id && x.round_number === m.round_number))
          throw new Error("This stage round already has games (already generated)");
      }
      (t[table] ??= []).push(...out);
      return out;
    },
    async select(table, f) { return (t[table] ?? []).filter((r) => match(r, f)); },
    async update(table, f, patch) { (t[table] ?? []).filter((r) => match(r, f)).forEach((r) => Object.assign(r, patch)); },
  };
  return { db, t };
}

const rrStage = { id: "rr", name: "Singles pools", kind: "round_robin", discipline: "singles", groups: 2, groupSize: 4, input: { entrants: 8 }, advance: { role: "none" },
  schedule: { mode: "fixed", startDate: "2026-10-01", roundDates: ["2026-10-01", "2026-10-02", "2026-10-03"] } };

function build(stages: any[], entrants = 8) {
  const def = presetDefinition("custom");
  def.divisions[0].sections[0].stages = stages as any;
  const parsed = DefinitionSchema.parse(def);
  const env = fakeDb();
  env.t.tournaments = [{ id: "t", builder_architecture: "structured", builder_spec: serializeSpec(specFromDefinition(parsed)) }];
  env.t.club_champs_entries = Array.from({ length: entrants }, (_, i) => ({ id: `e${i}`, champ_id: "t", club_member_id: `p${i + 1}`, group_number: 1, order_index: i }));
  return { env, div: parsed.divisions[0].id };
}

const num = (id: string) => Number(id.slice(1));
/** Record results for one stage: `higher` = the higher-numbered (lower seeded) player wins → standings reverse the seeding. */
function play(env: ReturnType<typeof fakeDb>, stage: string, rule: (a: string, b: string) => string) {
  for (const m of env.t.club_champs_matches.filter((x: any) => x.stage_key === stage)) { m.winner_member_id = rule(m.player_a_member_id, m.player_b_member_id); m.status = "completed"; }
}
const higher = (a: string, b: string) => (num(a) > num(b) ? a : b);

const doublesFromStandings = {
  id: "dx", name: "Doubles", kind: "cross_pool_league", discipline: "doubles", groups: 2, groupSize: 4, input: { fromStageId: "rr" }, advance: { role: "none" },
  schedule: { mode: "fixed", startDate: "2026-10-08", roundDates: ["2026-10-08"] },
  mapping: parseMapping("R1: A1+B1 v A3+B3\nR1: A2+B2 v A4+B4", { source: "stage_standings", sourceStageId: "rr", pools: 2, poolSize: 4, discipline: "doubles" }).mapping,
};

describe("stage progression engine", () => {
  it("Singles completes → predefined Doubles auto-generates exactly once, pairs from FINAL standings", async () => {
    const { env } = build([rrStage, doublesFromStandings]);
    await generateStructuredTournament(env.db, "t");
    expect((await stageLifecycle(env.db, "t")).find((s) => s.stageKey === "dx")!.state).toBe("waiting");
    expect((await autoProgress(env.db, "t")).started).toEqual([]); // nothing until Singles is finished
    play(env, "rr", higher);
    const r = await autoProgress(env.db, "t");
    expect(r.started.map((s) => s.stageKey)).toEqual(["dx"]);
    const dbl = env.t.club_champs_matches.filter((m: any) => m.stage_key === "dx");
    // Snake pools A = p1,p4,p5,p8 · B = p2,p3,p6,p7; higher number wins → A order p8,p5,p4,p1 · B order p7,p6,p3,p2.
    expect(dbl.map((m: any) => `${m.player_a_member_id}+${m.partner_a_member_id} v ${m.player_b_member_id}+${m.partner_b_member_id}`))
      .toEqual(["p8+p7 v p4+p3", "p5+p6 v p1+p2"]);
    // Repeated saves / refreshes / concurrent devices never duplicate the stage.
    await autoProgress(env.db, "t");
    await Promise.all([autoProgress(env.db, "t"), autoProgress(env.db, "t")]);
    expect(env.t.club_champs_matches.filter((m: any) => m.stage_key === "dx")).toHaveLength(2);
    expect((await stageLifecycle(env.db, "t")).find((s) => s.stageKey === "dx")!.state).toBe("active");
  });

  it("an unresolved tie holds progression with the exact reason; nothing is generated until the admin orders it", async () => {
    const { env, div } = build([rrStage, doublesFromStandings]);
    await generateStructuredTournament(env.db, "t");
    // Everyone wins against a lower number except a rock-paper-scissors cycle inside pool A → level on wins.
    play(env, "rr", higher);
    const a = env.t.club_champs_matches.filter((m: any) => m.stage_key === "rr" && m.pool_number === 1);
    const flip = a.find((m: any) => [m.player_a_member_id, m.player_b_member_id].sort().join() === "p5,p8");
    flip.winner_member_id = "p5"; // p8 and p5 now both on 2 wins
    const r = await autoProgress(env.db, "t");
    expect(r.started).toEqual([]);
    expect(r.blocked[0].detail).toMatch(/positions 1 and 2 are tied/);
    expect(env.t.club_champs_matches.some((m: any) => m.stage_key === "dx")).toBe(false);
    const before = JSON.stringify(env.t.club_champs_matches);
    await decidePositionOrder(env.db, "t", div, "rr", 0, ["p5", "p8", "p4", "p1"]);
    expect(JSON.stringify(env.t.club_champs_matches)).toBe(before); // recording a decision changes no result
    expect((await autoProgress(env.db, "t")).started.map((s) => s.stageKey)).toEqual(["dx"]);
    expect(env.t.club_champs_matches.find((m: any) => m.stage_key === "dx").player_a_member_id).toBe("p5");
  });

  it("a mapping that no longer resolves (empty position) blocks safely without partial games", async () => {
    const { env } = build([rrStage, doublesFromStandings], 7); // pool B has only 3 players → B4 is empty
    await generateStructuredTournament(env.db, "t");
    play(env, "rr", higher);
    const r = await autoProgress(env.db, "t");
    expect(r.started).toEqual([]);
    expect(r.blocked[0].detail).toMatch(/B4 has no player/);
    expect(env.t.club_champs_matches.some((m: any) => m.stage_key === "dx")).toBe(false);
  });

  describe("Define later", () => {
    const semi = { id: "sf", name: "Semi Finals", kind: "knockout", discipline: "singles", groups: 1, groupSize: null, defineLater: true, input: { fromStageId: "rr" }, advance: { role: "none" }, schedule: { mode: "unset", startDate: "2026-10-10" } };

    it("does not block creation; when the stage before finishes it prompts Set up next stage instead of generating", async () => {
      const { env } = build([rrStage, semi]);
      await generateStructuredTournament(env.db, "t");
      expect(env.t.club_champs_matches.every((m: any) => m.stage_key === "rr")).toBe(true);
      let sf = (await stageLifecycle(env.db, "t")).find((s) => s.stageKey === "sf")!;
      expect(sf.state).toBe("deferred");
      expect(sf.plannedDate).toBe("2026-10-10");
      play(env, "rr", higher);
      const r = await autoProgress(env.db, "t");
      expect(r.started).toEqual([]);
      expect(r.needsSetup.map((s) => s.stageKey)).toEqual(["sf"]);
      sf = (await stageLifecycle(env.db, "t")).find((s) => s.stageKey === "sf")!;
      expect(sf.state).toBe("needs_setup");
      expect(env.t.club_champs_matches.some((m: any) => m.stage_key === "sf")).toBe(false);
    });

    it("configuring it on the existing tournament creates only the new stage and preserves every earlier result", async () => {
      const { env, div } = build([rrStage, semi]);
      await generateStructuredTournament(env.db, "t");
      play(env, "rr", higher);
      const before = JSON.stringify(env.t.club_champs_matches);
      const stagesBefore = JSON.stringify((env.t.tournaments[0].builder_spec as any).divisions[0].stages);
      const mapping = parseMapping("R1: A1 v B2\nR1: B1 v A2", { source: "stage_standings", sourceStageId: "rr", pools: 2, poolSize: 4, discipline: "singles" }).mapping!;
      // Missing scoring is caught by the four checks.
      const bad = await checkDeferredSetup(env.db, "t", div, "sf", { kind: "mapped", matchFormat: "", mapping });
      expect(bad.scoring.length).toBe(1);
      expect(setupOk(bad)).toBe(false);
      await setupDeferredStage(env.db, "t", div, "sf", { kind: "mapped", matchFormat: "PAR 11, best of 5", mapping });
      const sf = env.t.club_champs_matches.filter((m: any) => m.stage_key === "sf");
      expect(sf.map((m: any) => `${m.player_a_member_id} v ${m.player_b_member_id}`)).toEqual(["p8 v p6", "p7 v p5"]);
      expect(JSON.stringify(env.t.club_champs_matches.filter((m: any) => m.stage_key === "rr"))).toBe(before);
      const spec = env.t.tournaments[0].builder_spec as any;
      expect(JSON.stringify(spec.divisions[0].stages.slice(0, -1))).toBe(stagesBefore);
      expect(spec.divisions[0].deferredStages).toEqual([]);
      expect((await stageLifecycle(env.db, "t")).find((s) => s.stageKey === "sf")!.state).toBe("active");
      // Set-up is one-shot and idempotent: it can't be run again or auto-duplicated.
      await expect(setupDeferredStage(env.db, "t", div, "sf", { kind: "mapped", matchFormat: "PAR 11", mapping })).rejects.toThrow();
      await autoProgress(env.db, "t");
      expect(env.t.club_champs_matches.filter((m: any) => m.stage_key === "sf")).toHaveLength(2);
    });

    it("can also be set up as a cross-pool knockout from pool qualifiers", async () => {
      const { env, div } = build([rrStage, semi]);
      await generateStructuredTournament(env.db, "t");
      play(env, "rr", higher);
      await setupDeferredStage(env.db, "t", div, "sf", { kind: "knockout", matchFormat: "PAR 11", qualify: { perPool: 2, mapping: "cross_pool", transition: null } });
      const sf = env.t.club_champs_matches.filter((m: any) => m.stage_key === "sf");
      expect(sf).toHaveLength(2);
      expect(sf.every((m: any) => m.pool_id == null)).toBe(true);
      expect(new Set(sf.flatMap((m: any) => [m.player_a_member_id, m.player_b_member_id]))).toEqual(new Set(["p8", "p5", "p7", "p6"]));
    });

    it("can't be set up before the stage before it has finished", async () => {
      const { env, div } = build([rrStage, semi]);
      await generateStructuredTournament(env.db, "t");
      const c = await checkDeferredSetup(env.db, "t", div, "sf", { kind: "knockout", matchFormat: "PAR 11", qualify: { perPool: 2, mapping: "cross_pool", transition: null } });
      expect(c.structure.join()).toMatch(/can't be set up yet/);
    });
  });
});
