import { describe, expect, it } from "vitest";
import { derivedLifecycle, needsOrganiser, runActions } from "@/lib/smart-builder/run-overview";
import type { StageStatus } from "@/lib/tournaments/progression";

const s = (div: string, name: string, state: StageStatus["state"], extra: Partial<StageStatus> = {}): StageStatus =>
  ({ divisionKey: div, divisionLabel: div, stageKey: name, name, state, automatic: false, detail: "", played: 0, total: 0, ...extra });

describe("Step run overview (Riverside regression)", () => {
  it("all 50 round games done → running, not stuck at Activate; never date-gated", () => {
    const st = [s("Men", "Rounds", "completed", { played: 25, total: 25 }), s("Men", "Semifinals", "ready", { plannedDate: "2099-11-02" }), s("Men", "Final", "waiting")];
    expect(derivedLifecycle(st, 50)).toBe("running");
    const [a] = runActions(st);
    expect(a.kind).toBe("generate");
    expect(needsOrganiser(a)).toBe(true);
  });
  it("qualifying tie is surfaced first as action required", () => {
    const st = [s("Men", "Semifinals", "ready"), s("Ladies", "Semifinals", "blocked", { detail: "Pool B: positions 2 and 3 are tied on wins" })];
    const acts = runActions(st);
    expect(acts[0].kind).toBe("resolve_tie");
    expect(acts[1].kind).toBe("generate");
  });
  it("automatic next stage shows as starting, paths independent", () => {
    const acts = runActions([s("Men", "Final", "ready", { automatic: true }), s("Ladies", "Semifinals", "active", { played: 1, total: 2 })]);
    expect(acts.map((a) => a.kind)).toEqual(["auto_starting", "in_play"]);
  });
  it("complete only when every stage is complete; no games → keep saved stage", () => {
    expect(derivedLifecycle([s("Men", "Final", "completed")], 3)).toBe("complete");
    expect(derivedLifecycle([s("Men", "Rounds", "waiting")], 0)).toBeNull();
  });
});
