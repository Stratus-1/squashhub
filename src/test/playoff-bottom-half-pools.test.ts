import { describe, it, expect } from "vitest";
import { buildPlayoffChain } from "@/lib/smart-builder/playoff-chain";
import { placeholderGames, placeholderStageLabel } from "@/lib/smart-builder/playoff-placeholders";
import { mappedFixtures } from "@/lib/tournaments/engine-service";

const main: any = { id: "v-s1", order: 1, kind: "round_robin", name: "Pools", discipline: "singles", poolMembers: [Array(7).fill("x"), Array(7).fill("y")] };
const plan: any = { mode: "scheduled", date: "2026-10-31", from: "12:00", to: "16:00", pairing: "crossover", trigger: "auto" };

describe("two-pool bottom half playoffs", () => {
  it("semis with 4 per pool: A1vB2, B1vA2, A3vB4, B3vA4; final round pairs top and bottom winners", () => {
    const r = buildPlayoffChain(main, "v", [{ name: "Semifinal", plan }, { name: "Final", plan: { ...plan, pairing: "winners" } }], { bottomHalf: true, qualifiers: { perPool: 4, runnersUp: 0 } });
    expect(r.reason).toBeNull();
    const m = r.stages[0].mapping!.matches.map((x) => `${x.a}v${x.b}`);
    expect(m).toEqual(["A1vB2", "B1vA2", "A3vB4", "B3vA4"]);
    expect(r.stages[1].mapping!.matches.length).toBe(2);
  });
});

describe("two-pool bottom half with 5th and 7th place games (Uitsig Men's A / Ladies B)", () => {
  const sched: any = { mode: "play_by", deadline: "2026-11-12", pairing: "crossover", trigger: "auto" };
  const fin: any = { mode: "play_by", deadline: "2026-11-21", pairing: "winners", trigger: "auto" };
  const rr: any = { id: "v-main", order: 0, kind: "round_robin", name: "Round robin", discipline: "singles", poolMembers: [["a1", "a2", "a3", "a4"], ["b1", "b2", "b3", "b4"]] };
  const chain = () => buildPlayoffChain(rr, "v", [{ name: "Semifinal", plan: sched }, { name: "Final", plan: fin }], { bottomHalf: true, thirdPlace: true });

  it("semis: A1vB2, B1vA2, then A3vB4, B3vA4 named for places 5–8", () => {
    const r = chain();
    expect(r.reason).toBeNull();
    const sf = r.stages[0].mapping!.matches;
    expect(sf.map((x) => `${x.a}v${x.b}`)).toEqual(["A1vB2", "B1vA2", "A3vB4", "B3vA4"]);
    expect(sf.map((x) => x.label ?? null)).toEqual([null, null, "Semifinal (5th–8th)", "Semifinal (5th–8th)"]);
  });

  it("final stage: Final (top winners) + 5th/6th place (bottom winners); 3rd place stage adds 7th/8th place", () => {
    const r = chain();
    expect(r.stages.map((s) => s.name)).toEqual(["Semifinal", "3rd place", "Final"]);
    const third = r.stages[1].mapping!, final = r.stages[2].mapping!;
    expect(final.matches.map((x) => [x.a, x.b, x.label ?? null])).toEqual([["A1", "A2", null], ["A3", "A4", "5th/6th place"]]);
    expect(third.losers).toBe(true);
    expect(third.matches.map((x) => x.label ?? null)).toEqual([null, "7th/8th place"]);
  });

  it("placeholders and real games carry the bottom-half names, top games keep theirs", () => {
    const r = chain();
    const div = { stages: [rr, ...r.stages] };
    const ph = placeholderGames(div);
    const byStage = (k: string) => ph.filter((x) => x.stageKey === k);
    const labels = (k: string) => byStage(k).map((x) => `${placeholderStageLabel(byStage(k), x)}: ${x.a} v ${x.b}`);
    expect(labels("v-po1")).toEqual(["Semifinal 1: Pool A #1 v Pool B #2", "Semifinal 2: Pool B #1 v Pool A #2", "Semifinal (5th–8th) 1: Pool A #3 v Pool B #4", "Semifinal (5th–8th) 2: Pool B #3 v Pool A #4"]);
    expect(labels("v-po2")).toEqual(["Final: Winner SF1 v Winner SF2", "5th/6th place: Winner SF3 v Winner SF4"]);
    expect(labels("v-po2-3p")).toEqual(["3rd place: Loser SF1 v Loser SF2", "7th/8th place: Loser SF3 v Loser SF4"]);
    const real = mappedFixtures("t", { divisionId: "g1", stages: div.stages } as any, r.stages[0], [["a1", "a2", "a3", "a4"], ["b1", "b2", "b3", "b4"]]);
    expect(real.map((f) => `${f.label}: ${f.a} v ${f.b}`)).toEqual(["Semifinal: a1 v b2", "Semifinal: b1 v a2", "Semifinal (5th–8th): a3 v b4", "Semifinal (5th–8th): b3 v a4"]);
  });

  it("without bottom half nothing is renamed", () => {
    const r = buildPlayoffChain(rr, "v", [{ name: "Semifinal", plan: sched }, { name: "Final", plan: fin }], { thirdPlace: true });
    expect(r.stages.flatMap((s) => s.mapping!.matches.map((x) => x.label ?? null)).every((l) => l === null)).toBe(true);
  });
});

describe("bottom-half placing games stay out of the title semis/final summary", () => {
  it("formalStageOf ignores 5th–8th games even with semi/final stage codes", async () => {
    const { formalStageOf } = await import("@/lib/tournaments/tournament-summary");
    expect(formalStageOf({ stage: "playoff_sf", stage_label: "Semifinal (5th–8th)" })).toBeNull();
    expect(formalStageOf({ stage: "playoff_final", stage_label: "5th/6th place" })).toBeNull();
    expect(formalStageOf({ stage: "ko", stage_label: "7th/8th place" })).toBeNull();
    expect(formalStageOf({ stage: "playoff_sf", stage_label: "Semifinal" })).toBe("sf");
    expect(formalStageOf({ stage: "playoff_final", stage_label: "Final" })).toBe("final");
  });
});
