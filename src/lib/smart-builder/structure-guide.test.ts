import { describe, expect, it } from "vitest";
import { evaluateStructures, materiallyDifferent } from "./structure-guide";

const top = (n: number, o: any, s: any, t: any, isChamps = false) => evaluateStructures({ n, outcome: o, strength: s, time: t, isChamps })[0];

describe("structure guide", () => {
  it("club champs ranking 20 players favours pools + positional playoffs over Swiss", () => {
    const r = top(20, "rank", "broad", "some", true);
    expect(r.kind).toBe("pools");
    expect(r.playoff).toBe("placement");
  });
  it("winner quickly with tight time favours knockout", () => {
    expect(top(20, "winner", null, "tight").kind).toBe("knockout");
  });
  it("large field, similar strength, constrained → Swiss", () => {
    expect(top(32, "balanced", "similar", "tight").kind).toBe("swiss");
  });
  it("small field ranking → round robin", () => {
    expect(top(6, "rank", "broad", "plenty").kind).toBe("round_robin");
  });
  it("estimates round demand", () => {
    const rr = evaluateStructures({ n: 6, outcome: "rank", strength: null, time: "plenty" }).find((x) => x.kind === "round_robin")!;
    expect(rr.matches).toBe(15);
    expect(rr.rounds).toBe(5);
  });
  it("material difference", () => {
    expect(materiallyDifferent(20, 12)).toBe(true);
    expect(materiallyDifferent(20, 18)).toBe(false);
    expect(materiallyDifferent(4, 6)).toBe(false);
  });
});
