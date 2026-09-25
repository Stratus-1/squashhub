import { describe, it, expect } from "vitest";
import { emptyDefinition, parseDefinition, type TournamentDefinition } from "@/lib/smart-builder/definition";
import { applyDiamondLeague, diamondCurrent, resizeDiamond } from "@/lib/smart-builder/diamond-league";
import { cannotDefer, deferralIssues, normalizeDeferral, setDefineLater } from "@/lib/smart-builder/deferred";
import { validateDefinition } from "@/lib/smart-builder/validate";
import { scoringIssues } from "@/lib/smart-builder/scoring";
import { scheduleMaths } from "@/lib/smart-builder/schedule-maths";
import { specFromDefinition } from "@/lib/tournaments/structured-persist";
import { ownershipIssues } from "@/lib/smart-builder/division-structure";

const stagesOf = (def: TournamentDefinition, di: number) => def.divisions[di].sections.flatMap((s) => s.stages);
const roundTrip = (def: TournamentDefinition) => { const r = parseDefinition(JSON.parse(JSON.stringify(def))); if (r.ok === false) throw new Error(r.error); return r.value; };
const diamond = (divisions = 2, ppd = 4, size = 6) => { const d = emptyDefinition(); applyDiamondLeague(d, { divisions, poolsPerDivision: ppd, poolSize: size }); return d; };

describe("one canonical structure: template → form → Review → create payload", () => {
  it("2 divisions × 4 pools × 6: the shape is read from the definition itself and survives save/reload", () => {
    const def = roundTrip(diamond());
    expect(diamondCurrent(def)).toEqual({ divisions: 2, poolsPerDivision: 4, poolSize: 6 });
    expect(def.admission?.capacity).toBe(48);
    for (const di of [0, 1]) expect(stagesOf(def, di).map((s) => [s.name, !!s.defineLater])).toEqual([["Singles", false], ["Doubles", false], ["Semi-finals", true], ["Finals", true]]);
  });

  it("Review never says a division has no stages, and deferred semis/finals never block on rounds, scoring caps or dates", () => {
    const def = roundTrip(diamond());
    const v = validateDefinition(def);
    expect(v.issues.find((i) => i.code === "empty_division")).toBeUndefined();
    expect(v.issues.find((i) => i.code === "define_later_order")).toBeUndefined();
    const deferredIds = new Set([0, 1].flatMap((di) => stagesOf(def, di).filter((s) => s.defineLater).map((s) => s.id)));
    expect(v.issues.filter((i) => i.level === "error" && i.stageId && deferredIds.has(i.stageId))).toEqual([]);
    expect(scoringIssues(def).filter((i) => i.stageId && deferredIds.has(i.stageId))).toEqual([]);
    expect(scheduleMaths(def).issues.filter((i) => i.stageId && deferredIds.has(i.stageId))).toEqual([]);
    // Open semi/final rules are for later, not a Create blocker; scoring rules for stages that run now still block.
    expect(v.issues.some((i) => i.code === "open_question" && /Semi-final|Final rules/.test(i.message))).toBe(false);
    expect(v.issues.some((i) => i.code === "open_question" && /points/i.test(i.message))).toBe(true);
  });

  it("the create payload has both divisions with Singles + Doubles, and semis/finals only as planning targets", () => {
    const spec = specFromDefinition(roundTrip(diamond()));
    expect(spec.divisions).toHaveLength(2);
    for (const d of spec.divisions) {
      expect(d.stages).toHaveLength(2);
      expect(d.deferredStages?.map((x) => x.name)).toEqual(["Semi-finals", "Finals"]);
    }
  });

  it("changing players per pool / pools per division edits the same state and keeps per-division settings", () => {
    const def = diamond();
    const d2 = stagesOf(def, 1);
    d2[0].scoring = { mode: "standard", pointsPerGame: 15, bestOf: 3 } as any;
    def.divisions[1].poolNames = ["Aces", "Boasts", "Drops", "Lobs"];
    const ids = def.divisions.map((d) => d.id);
    resizeDiamond(def, { divisions: 2, poolsPerDivision: 3, poolSize: 4 });
    expect(def.divisions.map((d) => d.id)).toEqual(ids);
    expect(stagesOf(def, 1)[0].scoring).toMatchObject({ pointsPerGame: 15 });
    expect(def.divisions[1].poolNames).toEqual(["Aces", "Boasts", "Drops"]);
    expect(stagesOf(def, 0)[0].groups).toBe(3);
    expect(stagesOf(def, 0)[0].tieFormat?.rubbers).toHaveLength(4);
    expect(stagesOf(def, 0)[1].tieFormat?.rubbers).toHaveLength(2);
    expect(def.admission?.capacity).toBe(24);
    expect(specFromDefinition(def).divisions).toHaveLength(2);
  });

  it("adding a division copies the last one independently; removing drops only the last", () => {
    const def = diamond(2);
    setDefineLater(def.divisions[1], stagesOf(def, 1)[2].id, false); // Division 2 decided its semis
    resizeDiamond(def, { divisions: 3, poolsPerDivision: 4, poolSize: 6 });
    expect(def.divisions.map((d) => d.name)).toEqual(["Division 1", "Division 2", "Division 3"]);
    expect(ownershipIssues(def)).toEqual([]);
    expect(stagesOf(def, 2)[2].defineLater).toBeFalsy();
    expect(stagesOf(def, 2)[1].sameSessionAs).toBe(stagesOf(def, 2)[0].id);
    const removed = resizeDiamond(def, { divisions: 2, poolsPerDivision: 4, poolSize: 6 });
    expect(removed).toEqual(["Division 3"]);
    expect(stagesOf(def, 1)[2].defineLater).toBeFalsy();
  });
});

describe("Define later follows one rule", () => {
  it("the first stage and a same-session stage can't be deferred; deferring defers everything after", () => {
    const def = diamond(1);
    const d = def.divisions[0], [s1, s2, s3, s4] = stagesOf(def, 0);
    expect(cannotDefer(d, s1.id)).toMatch(/first stage/);
    expect(cannotDefer(d, s2.id)).toMatch(/same session/);
    expect(setDefineLater(d, s1.id, true)).toBe(false);
    setDefineLater(d, s3.id, false);
    expect([s3.defineLater, s4.defineLater]).toEqual([undefined, true]);
    setDefineLater(d, s3.id, true);
    expect([s3.defineLater, s4.defineLater]).toEqual([true, true]);
    setDefineLater(d, s4.id, false);
    expect([s3.defineLater, s4.defineLater]).toEqual([undefined, undefined]);
  });

  it("repairs the Riverside state on load: a division with every stage deferred becomes Singles/Doubles now, Semis/Finals later", () => {
    const def = diamond(2);
    stagesOf(def, 1).forEach((s) => { s.defineLater = true; });
    stagesOf(def, 0)[2].sameSessionAs = stagesOf(def, 0)[1].id; // stray link seen in the draft
    expect(deferralIssues(def).length).toBeGreaterThan(0);
    const before = validateDefinition(def);
    expect(before.issues.find((i) => i.code === "empty_division")?.message).toMatch(/every stage is set to Define later/);
    const fixed = roundTrip(def);
    expect(stagesOf(fixed, 1).map((s) => !!s.defineLater)).toEqual([false, false, true, true]);
    expect(deferralIssues(fixed)).toEqual([]);
    expect(validateDefinition(fixed).issues.find((i) => i.code === "empty_division")).toBeUndefined();
    void normalizeDeferral;
  });
});
