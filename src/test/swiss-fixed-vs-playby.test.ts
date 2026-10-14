import { describe, it, expect } from "vitest";
import { generateCategoryDraw, scheduleDraws, capacityReport, parseRoundEntries } from "@/lib/tournaments/swiss-positional-draw";
const ents = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, seed: i + 1 }));
describe("fixed vs play-by scheduling", () => {
  const d = generateCategoryDraw({ categoryKey: "a", label: "A", entrants: ents(16) as never, rounds: 3 });
  it("play-by only when explicitly marked", () => {
    const pr = parseRoundEntries("2026-11-04, by:2026-11-25, ");
    expect(pr.dates).toEqual(["2026-11-04", null, null]);
    expect(pr.playBy).toEqual([null, "2026-11-25", null]);
  });
  it("fixed rounds get exact unique court+time even with TBD players; shortage flagged, never play-by", () => {
    const pr = parseRoundEntries("2026-11-04, 2026-11-11");
    const opts = { roundDates: { a: pr.dates }, playBy: { a: pr.playBy }, courts: [{ id: 1, name: "C1" }, { id: 2, name: "C2" }], times: ["18:00", "18:30", "19:00"], matchMinutes: 30, restMinutes: 0 };
    const s = scheduleDraws([d], opts);
    const r2 = d.fixtures.filter((f) => f.round === 2).map((f) => Object.entries(s).find(([k]) => k.includes(`r2`) && k.endsWith(`${f.match ?? ""}`))).length;
    expect(r2).toBeGreaterThan(0);
    const vals = Object.values(s);
    expect(vals.some((v) => v.kind === "play_by")).toBe(false);
    const placed = vals.filter((v: any) => v.kind === "slot" || v.courtId != null) as any[];
    const keys = placed.map((v) => `${v.date}|${v.time}|${v.courtId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(vals.some((v: any) => v.kind === "unscheduled" && /Shortage/.test(v.reason))).toBe(true);
    expect(capacityReport([d], opts).find((c) => c.date === "2026-11-11")).toMatchObject({ needed: 8, available: 6, short: 2 });
  });
});
