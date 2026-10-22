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
describe("planned bracket sides", () => {
  const qf = { stages: [
    { name: "Quarterfinal", unit: "X", phase: "playoff", pairing: "crossover" },
    { name: "Semifinal", unit: "X", phase: "playoff", pairing: "winners" },
    { name: "Final", unit: "X", phase: "playoff", pairing: "winners" },
  ] };
  it("8 qualifiers: 4 QF, 2 SF, final with placeholders, never provisional names", () => {
    const r = plannedPlayoffBracket(qf, "X", 2, null);
    expect(r.map((x) => x.id)).toEqual(["QF1", "QF2", "QF3", "QF4", "SF1", "SF2", "Final"]);
    expect(r[0].sides.map((s) => s.name)).toEqual([null, null]);
    expect(r[0].sides[0].label).toMatch(/^Pool [AB] – \d(st|nd|rd|th)$/);
    expect(r[4].sides.map((s) => s.label)).toEqual(["Winner QF1", "Winner QF2"]);
  });
  it("4 qualifiers start at SF and names appear only when standings given", () => {
    expect(plannedPlayoffBracket(plan, "Mens A", 2, null)[0].sides[0]).toMatchObject({ label: "Pool A – 1st", name: null });
    expect(plannedPlayoffBracket(plan, "Mens A", 2, [["Ann", "Bob"], ["Cid", "Dan"]])[0].sides[1]).toMatchObject({ label: "Pool B – 2nd", name: "Dan" });
  });
});
