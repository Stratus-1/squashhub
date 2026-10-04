import { describe, it, expect } from "vitest";
import { proposeFormat, playoffStagesFor } from "@/lib/smart-builder/step-draw";
import { placeholderGames, placeholderAdoption, legacyStageOf } from "@/lib/smart-builder/playoff-placeholders";
import { planAssumedSchedule, type AssumeGame } from "@/lib/tournaments/assumed-schedule";

const plan = {
  format: { kind: "pools", pools: 2 },
  playoff: { choice: "playoffs", rounds: 2, pairing: "cross_pools" },
  days: [{ date: "2026-10-10", courtIds: [1, 2], windows: [{ from: "08:00", to: "18:00" }] }, { date: "2026-10-11", courtIds: [1, 2], windows: [{ from: "08:00", to: "14:00" }] }],
  scheduling: { singles: 30, doubles: 40, rest: 10, playoffStart: { mode: "relative", restMinutes: 30 } },
};
const main = { id: "v-main", order: 0, kind: "pools", name: "Pools", pools: 2, poolMembers: [["a", "b", "c"], ["d", "e", "f"]], discipline: "singles" };

describe("weekend pools + Semifinals + Final", () => {
  it("creates real predefined SF and Final stages (not Define later)", () => {
    const p = proposeFormat(plan as any, "Men");
    expect(p.playoffs).toEqual(["Semi-final", "Final"]);
    const r = playoffStagesFor(main, "v", p as any);
    expect(r.deferredStages).toEqual([]);
    expect(r.stages.map((s: any) => s.name)).toEqual(["Pools", "Semi-final", "Final"]);
  });
  it("placeholders follow the configured crossover pairing and winner feed", () => {
    const p = proposeFormat(plan as any, "Men");
    const { stages } = playoffStagesFor(main, "v", p as any);
    const g = placeholderGames({ stages });
    expect(g.map((x) => `${x.stageName}: ${x.a} v ${x.b}`)).toEqual([
      "Semi-final: Pool A #1 v Pool B #2", "Semi-final: Pool B #1 v Pool A #2", "Final: Winner SF1 v Winner SF2",
    ]);
    expect(legacyStageOf("Semi-final")).toBe("playoff_sf");
  });
  it("no pairing answered => stays Define later (never inferred)", () => {
    const p = proposeFormat({ ...plan, playoff: { choice: "playoffs", rounds: 2 } } as any, "Men");
    expect(playoffStagesFor(main, "v", p as any).deferredStages.length).toBe(2);
  });
  it("unknown participants still get court slots after qualifying + rest, Final after SFs", () => {
    const q: AssumeGame[] = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, round: (i % 3) + 1, pool: i < 3 ? 1 : 2, unitKey: "Men", doubles: false, people: [`p${i}`, `x${i}`], phase: 0 }));
    const po: AssumeGame[] = [
      { id: "sf1", round: 901, pool: null, unitKey: "Men", doubles: false, people: [], phase: 12 },
      { id: "sf2", round: 901, pool: null, unitKey: "Men", doubles: false, people: [], phase: 12 },
      { id: "f", round: 902, pool: null, unitKey: "Men", doubles: false, people: [], phase: 13 },
    ];
    const r = planAssumedSchedule({ games: [...q, ...po], days: [{ date: "2026-10-10", from: "08:00", to: "18:00", courtIds: [1, 2] }], singles: 30, doubles: 40, rest: 10, rules: [], busy: [], playoffStart: { mode: "relative", restMinutes: 30 } } as any);
    expect(r.issues).toEqual([]);
    const at = (id: string) => r.slots.find((s) => s.id === id)!;
    const lastQ = Math.max(...q.map((g) => { const s = at(g.id); return Number(s.end.slice(0, 2)) * 60 + Number(s.end.slice(3)); }));
    const sf = Number(at("sf1").time.slice(0, 2)) * 60 + Number(at("sf1").time.slice(3));
    expect(sf).toBeGreaterThanOrEqual(lastQ + 30);
    expect(at("f").time > at("sf1").time && at("f").time > at("sf2").time).toBe(true);
    expect(at("sf1").courtId).toBeTruthy();
  });
  it("real games take over placeholder slots in bracket order, no duplicates", () => {
    const ph = [1, 2].map((o) => ({ id: `ph${o}`, group: 1, stageKey: "v-po1#ph", order: o, date: "2026-10-11", time: `09:0${o}:00`, courtId: o }));
    const real = [2, 1].map((o) => ({ id: `r${o}`, group: 1, stageKey: "v-po1", order: o, date: null, time: null, courtId: null }));
    const a = placeholderAdoption(ph, real);
    expect(a.map((x) => `${x.placeholder.id}->${x.real.id}`)).toEqual(["ph1->r1", "ph2->r2"]);
    expect(placeholderAdoption(ph, [])).toEqual([]);
  });
});
