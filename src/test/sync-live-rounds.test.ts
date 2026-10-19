import { describe, expect, it } from "vitest";
import { syncSwissRoundsToSpec } from "@/lib/smart-builder/sync-live-rounds";

const spec = { divisions: [
  { label: "Mens B · Singles", groupNumber: 3, stages: [{ order: 0, kind: "swiss", swissRounds: 3 }] },
  { label: "Ladies B · Singles", groupNumber: 7, stages: [{ order: 0, kind: "round_robin" }] },
] };

describe("Structure Swiss rounds reach the running tournament", () => {
  it("raising 3 to 4 updates the running tournament", () => {
    const r = syncSwissRoundsToSpec(spec, { "Mens B": [{ kind: "swiss", rounds: 4 }] }, { 3: 1 });
    expect(r.spec.divisions[0].stages[0].swissRounds).toBe(4);
    expect(r.changes).toEqual([{ label: "Mens B", from: 3, to: 4 }]);
  });
  it("cannot go below a round that already has games", () => {
    const r = syncSwissRoundsToSpec(spec, { "Mens B": [{ kind: "swiss", rounds: 2 }] }, { 3: 3 });
    expect(r.spec.divisions[0].stages[0].swissRounds).toBe(3);
    expect(r.blocked).toHaveLength(1);
  });
  it("leaves round-robin categories alone", () => {
    const r = syncSwissRoundsToSpec(spec, { "Ladies B": [{ kind: "swiss", rounds: 4 }] });
    expect(r.changes).toEqual([]);
  });
});
