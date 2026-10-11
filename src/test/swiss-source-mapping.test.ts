import { describe, it, expect } from "vitest";
import { contractIssues } from "@/lib/tournaments/contract";

const swiss: any = { id: "main", order: 0, name: "Swiss rounds", kind: "swiss", swissRounds: 5, discipline: "singles", schedule: { rule: "window" } };
const ko: any = { id: "ko", order: 0, name: "Knockout", kind: "knockout", drawSize: 16, discipline: "singles", schedule: { rule: "window" } };
const qf = (src: any, pools = 1): any => ({
  id: "po1", order: 1, name: "Quarterfinal", kind: "mapped", discipline: "singles", schedule: { rule: "window" }, generation: "owner_approval",
  mapping: { source: "stage_standings", sourceStageId: src.id, pools, poolSize: 8, discipline: "singles",
    units: Array.from({ length: 8 }, (_, i) => ({ id: `A${i + 1}`, slots: [{ pool: 0, position: i + 1 }] })),
    matches: [["A1", "A8"], ["A4", "A5"], ["A2", "A7"], ["A3", "A6"]].map(([a, b], i) => ({ round: 1, a, b, slot: i + 1 })) },
});
const msgs = (stages: any[]) => contractIssues({ divisionId: "g1", unit: "players", stages, entrants: Array.from({ length: 16 }, (_, i) => ({ id: `p${i}` })) } as any)
  .filter((i) => i.level === "error" && /finishing positions|standings table|pools, the mapping/.test(i.message)).map((i) => i.message);

describe("Swiss → seeded play-off source", () => {
  it("accepts final Swiss standings as the Quarterfinal source", () => { expect(msgs([swiss, qf(swiss)])).toEqual([]); });
  it("still rejects a Swiss source split into several pools", () => { expect(msgs([swiss, qf(swiss, 2)]).length).toBe(1); });
  it("still rejects finishing positions from a knockout stage", () => { expect(msgs([ko, qf(ko)])[0]).toMatch(/can only come from/); });
});
