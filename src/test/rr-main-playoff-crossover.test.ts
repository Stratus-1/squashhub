import { describe, it, expect } from "vitest";
import { buildPlayoffChain } from "@/lib/smart-builder/playoff-chain";
import { resolveMapping } from "@/lib/tournaments/mapping";

/**
 * The play-off setup saves "Pool crossover: A1 vs B2, B1 vs A2" (Uitsig Club Champs 2026,
 * Ladies B / Men's A). A round-robin main stage holds several pools (one poolMembers entry
 * each), so the derived mapping must pair ACROSS them — collapsing to one ranked list
 * produced "#1 v #4 / #2 v #3" slots fed by the first pool only.
 */
describe("round-robin main stage play-offs honour the saved pool pairing", () => {
  const rrMain = {
    id: "vmv6lrpfa-main", order: 0, kind: "round_robin",
    poolMembers: [["a1", "a2", "a3", "a4"], ["b1", "b2", "b3", "b4"]],
  } as any;

  const finPlan = { pairing: "later", mode: "play_by", deadline: "2026-11-21", date: null, from: null, to: null, courtIds: [], trigger: "manual" } as any;

  it("Semifinal after a 2-pool round robin maps A1 v B2 and B1 v A2", () => {
    const plan = { pairing: "crossover", mode: "play_by", deadline: "2026-11-12", date: null, from: null, to: null, courtIds: [], trigger: "manual" } as any;
    const r = buildPlayoffChain(rrMain, "v", [{ name: "Semifinal", plan }, { name: "Final", plan: finPlan }]);
    expect(r.reason).toBeNull();
    const m = r.stages[0].mapping!;
    expect(m.pools).toBe(2);
    expect(m.matches.map((x) => [x.a, x.b])).toEqual([["A1", "B2"], ["B1", "A2"]]);
  });

  it("resolves the crossover slots from BOTH pools' finishing orders, never pool A alone", () => {
    const plan = { pairing: "crossover", mode: "play_by", deadline: "2026-11-12", date: null, from: null, to: null, courtIds: [], trigger: "manual" } as any;
    const r = buildPlayoffChain(rrMain, "v", [{ name: "Semifinal", plan }, { name: "Final", plan: finPlan }]);
    const m = r.stages[0].mapping!;
    // positions[0] = Pool A order, positions[1] = Pool B order.
    const resolved = resolveMapping(m, [["PA1", "PA2", "PA3", "PA4"], ["PB1", "PB2", "PB3", "PB4"]]);
    expect(resolved.map((x) => [x.aId, x.bId])).toEqual([["PA1", "PB2"], ["PB1", "PA2"]]);
  });

  it("keeps the final fed by semifinal winners", () => {
    const sf = { pairing: "crossover", mode: "play_by", deadline: "2026-11-12", date: null, from: null, to: null, courtIds: [], trigger: "manual" } as any;
    const fin = { pairing: "later", mode: "play_by", deadline: "2026-11-21", date: null, from: null, to: null, courtIds: [], trigger: "manual" } as any;
    const r = buildPlayoffChain(rrMain, "v", [{ name: "Semifinal", plan: sf }, { name: "Final", plan: fin }]);
    expect(r.reason).toBeNull();
    const finalStage = r.stages[1];
    expect(finalStage.mapping!.source).toBe("stage_winners");
    expect(finalStage.mapping!.matches.map((x) => [x.a, x.b])).toEqual([["A1", "A2"]]);
  });

  it("a one-group round robin still pairs seeded within its single list", () => {
    const plan = { pairing: "crossover", mode: "play_by", deadline: "2026-11-12", date: null, from: null, to: null, courtIds: [], trigger: "manual" } as any;
    const single = { id: "m", order: 0, kind: "round_robin", poolMembers: [["p1", "p2", "p3", "p4"]] } as any;
    const r = buildPlayoffChain(single, "v", [{ name: "Semifinal", plan }, { name: "Final", plan: finPlan }]);
    expect(r.reason).toBeNull();
    expect(r.stages[0].mapping!.pools).toBe(1);
    expect(r.stages[0].mapping!.matches.map((x) => [x.a, x.b])).toEqual([["A1", "A4"], ["A2", "A3"]]);
  });
});
