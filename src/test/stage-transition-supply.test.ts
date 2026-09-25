import { describe, it, expect } from "vitest";
import { presetDefinition } from "@/lib/smart-builder/quick-path";
import { addStage, setDiscipline } from "@/lib/smart-builder/stage-builder";
import { validateDefinition } from "@/lib/smart-builder/validate";

// Riverside draft shape: 24 singles in 4 pools of 6 → everyone continues, paired 1+2, 3+4 → doubles RR.
const riverside = (s2Groups: number, s2Size: number) => {
  const def = presetDefinition("custom");
  const d = def.divisions[0];
  const s1 = d.sections[0].stages[0];
  s1.input = { ...s1.input, entrants: 24 }; s1.groups = 4; s1.groupSize = 6; s1.discipline = "singles";
  const id = addStage(d);
  setDiscipline(d, id, "doubles");
  const s2 = d.sections[0].stages[1];
  s2.groups = s2Groups; s2.groupSize = s2Size;
  s2.progression = { mode: "all_continue", standings: "reset", pairing: "positions", top: null } as any;
  s1.advance = { role: "none" };
  return { def, s2 };
};

describe("stage-builder transition supply (destination progression, not source advance)", () => {
  it("24 players all continuing → 12 pairs, never 0", () => {
    const { def, s2 } = riverside(4, 6);
    const v = validateDefinition(def);
    expect(v.flows[s2.id].supply).toBe(12);
    const msg = v.issues.find((i) => i.stageId === s2.id && i.code === "count_mismatch")?.message ?? "";
    expect(msg).toMatch(/expects 6 pairs per group, but each group receives 3/);
  });
  it("4 pools of 3 pairs matches exactly", () => {
    const { def, s2 } = riverside(4, 3);
    const v = validateDefinition(def);
    expect(v.issues.filter((i) => i.stageId === s2.id && i.level === "error")).toEqual([]);
  });
  it("top 2 from each pool → 8 players → 4 pairs", () => {
    const { def, s2 } = riverside(1, 4);
    s2.progression = { mode: "top_n", perPool: true, top: 2, standings: "reset", pairing: "positions" } as any;
    expect(validateDefinition(def).flows[s2.id].supply).toBe(4);
  });
});
