import { describe, it, expect } from "vitest";
import { swissDivisionProgress } from "@/lib/tournaments/swiss-progress";
const div = (id: string) => ({ divisionId: id, label: id, stages: [{ id: "s", kind: "swiss", swissRounds: 6 }] });
const done = (a: string, b: string) => ({ a, b, round: 1, status: "completed", winner: a });
const plan2 = [{ name: "Round 1", phase: "main", mode: "scheduled", date: "2026-10-13", unit: "" }, { name: "Round 2", phase: "main", mode: "scheduled", date: "2026-10-20", unit: "" }];
describe("swiss progress", () => {
  it("bye with null opponent never blocks; existing Round 2 schedule → generate", () => {
    const r = swissDivisionProgress([div("B")], () => [done("a", "b"), { a: "w", b: null, round: 1, status: "scheduled" }], plan2)[0];
    expect(r.action).toBe("generate"); expect(r.current).toMatchObject({ done: 1, total: 1 });
  });
  it("no Round 2 schedule → set up round", () => {
    expect(swissDivisionProgress([div("A")], () => [done("a", "b")], plan2.slice(0, 1))[0].action).toBe("setup_round");
  });
  it("open match → wait with pending list", () => {
    const r = swissDivisionProgress([div("A")], () => [done("a", "b"), { a: "c", b: "d", round: 1, status: "scheduled" }], plan2)[0];
    expect(r.action).toBe("wait"); expect(r.current.pending).toHaveLength(1);
  });
  it("categories progress independently", () => {
    const rs = swissDivisionProgress([div("A"), div("B")], (di) => di === 0 ? [done("a", "b")] : [{ a: "c", b: "d", round: 1 }], plan2);
    expect(rs.map((r) => r.action)).toEqual(["generate", "wait"]);
  });
});
