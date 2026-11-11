import { describe, it, expect } from "vitest";
import { stageSchedulesForUnit } from "@/lib/tournaments/round-scheduling";

const w = { date: "2026-10-20", from: "18:00", to: "20:00", courtIds: [1] };
const plan = { stages: [
  { id: "r1", name: "Round 1", phase: "main", mode: "play_by", deadline: "2026-10-22", unit: "", ...w },
  { id: "r2", name: "Round 2", phase: "main", mode: "play_by", deadline: "2026-10-29", unit: "", ...w },
  { id: "r3", name: "Round 3", phase: "main", mode: "play_by", deadline: "2026-11-05", unit: "", ...w },
  ...["Mens B", "Mens C", "Ladies A"].map((u) => ({ id: `r4-${u}`, name: "Round 4", phase: "main", mode: "play_by", deadline: "2026-11-12", unit: u, ...w })),
  ...["Mens B", "Mens C", "Ladies A"].map((u) => ({ id: `r5-${u}`, name: "Round 5", phase: "main", mode: "play_by", deadline: "2026-11-19", unit: u, ...w })),
  { id: "sf", name: "Semifinal", phase: "playoff", mode: "play_by", deadline: "2026-11-12", unit: "Mens A", ...w },
] };

describe("stageSchedulesForUnit (category-scoped round timeline)", () => {
  it("counts five rounds for Ladies A, not one row per category", () => {
    const tl = stageSchedulesForUnit(plan, "Ladies A · Singles");
    expect(tl.map((s) => s.id)).toEqual(["r1", "r2", "r3", "r4-Ladies A", "r5-Ladies A"]);
  });
  it("keeps Round 5's own deadline in the fifth position", () => {
    expect(stageSchedulesForUnit(plan, "Ladies A · Singles")[4].deadline).toBe("2026-11-19");
  });
  it("returns only shared rounds for a category with no scoped rows", () => {
    expect(stageSchedulesForUnit(plan, "Mens A · Singles").map((s) => s.id)).toEqual(["r1", "r2", "r3"]);
  });
  it("is unchanged when no stage is category-scoped", () => {
    const shared = { stages: plan.stages.slice(0, 3) };
    expect(stageSchedulesForUnit(shared, "Ladies A · Singles")).toHaveLength(3);
  });
});
