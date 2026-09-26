import { describe, it, expect } from "vitest";
import { assignCompetitions } from "@/hooks/use-league-strength";
describe("assignCompetitions", () => {
  it("splits WP divisions into separate competitions", () => {
    const d = (id: number, n: number) => ({ external_division_id: String(id), division_name: `${n}th League` });
    const m = assignCompetitions([d(14822,1),d(14823,2),d(14827,6),d(14829,2),d(14830,3),d(14845,18),d(14846,1),d(14847,2)]);
    expect(m.get("14822")).toBe(m.get("14827"));
    expect(m.get("14829")).not.toBe(m.get("14827"));
    expect(m.get("14845")).toBe(m.get("14829"));
    expect(m.get("14846")).not.toBe(m.get("14845"));
    expect(m.get("14847")).toBe(m.get("14846"));
  });
});
