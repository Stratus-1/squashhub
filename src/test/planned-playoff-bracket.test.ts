import { describe, it, expect } from "vitest";
import { plannedPlayoffBracket } from "@/lib/tournaments/planned-playoff-bracket";
const plan = { stages: [
  { name: "Semifinal", unit: "Mens A", phase: "playoff", mode: "play_by", deadline: "2026-11-14", pairing: "crossover" },
  { name: "Final", unit: "Mens A", phase: "playoff", mode: "scheduled", date: "2026-11-15", from: "11:00", to: "17:00", pairing: "winners" },
] };
describe("planned play-off bracket", () => {
  it("shows positions while the round robin is running", () => {
    const r = plannedPlayoffBracket(plan, "Mens A", 2, null);
    expect(r.map((x) => `${x.id} ${x.text}`)).toEqual(["SF1 A1 v B2", "SF2 B1 v A2", "Final Winner SF1 v Winner SF2"]);
    expect(r[0].when).toBe("play by 2026-11-14");
    expect(r[2].when).toBe("2026-11-15 11:00–17:00");
  });
  it("fills in names once standings are final", () => {
    const r = plannedPlayoffBracket(plan, "Mens A", 2, [["Ann", "Bob"], ["Cid", "Dan"]]);
    expect(r[0].text).toBe("Ann (A1) v Dan (B2)");
  });
  it("other categories without planned play-offs show nothing", () => {
    expect(plannedPlayoffBracket(plan, "Ladies B", 1, null)).toEqual([]);
  });
});
