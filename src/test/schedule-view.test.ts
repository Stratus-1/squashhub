import { describe, it, expect } from "vitest";
import { calendarRows, courtOverlaps, stageBadge, stageConfigured, stageStatus, type ViewStage } from "@/lib/smart-builder/schedule-view";

const st = (p: Partial<ViewStage>): ViewStage => ({ id: "x", name: "Round 1", unit: "", mode: "scheduled", deadline: "", date: "2026-10-20", from: "18:00", to: "21:00", courtIds: ["c1", "c2"], phase: "main", ...p });

describe("schedule view (presentation only)", () => {
  it("numbers main rounds and labels playoff stages", () => {
    expect(stageBadge(st({}), 0)).toBe("01");
    expect(stageBadge(st({}), 4)).toBe("05");
    expect(stageBadge(st({ phase: "playoff", name: "Quarterfinal" }), 0)).toBe("QF");
    expect(stageBadge(st({ phase: "playoff", name: "Semifinal" }), 1)).toBe("SF");
    expect(stageBadge(st({ phase: "playoff", name: "Final" }), 2)).toBe("F");
  });
  it("collapsed status: incomplete, fits, short, play-by", () => {
    expect(stageConfigured(st({ courtIds: [] }))).toBe(false);
    expect(stageStatus(st({ courtIds: [] }), null, false)).toBe("incomplete");
    expect(stageStatus(st({}), { matches: 8, slots: 12, fits: true }, false)).toBe("fits");
    expect(stageStatus(st({}), { matches: 14, slots: 12, fits: false }, false)).toBe("short");
    expect(stageStatus(st({ mode: "play_by", deadline: "2026-10-30" }), null, false)).toBe("play_by");
    expect(stageStatus(st({ phase: "playoff" }), null, false)).toBe("reserved");
  });
  it("main-round court clashes are red; playoff stages sharing an evening are only flagged as shared", () => {
    const a = st({ id: "a", name: "Round 1" }); const b = st({ id: "b", name: "Round 2", from: "20:00", to: "22:00", courtIds: ["c2"] });
    expect(courtOverlaps([a, b]).clash.get("a")).toEqual(["Round 2"]);
    const q1 = st({ id: "q1", name: "Quarterfinal", unit: "Men A", phase: "playoff" }); const q2 = st({ id: "q2", name: "Quarterfinal", unit: "Ladies", phase: "playoff" });
    const o = courtOverlaps([q1, q2]); expect(o.clash.size).toBe(0); expect(o.shared.get("q1")).toEqual(["Quarterfinal"]);
    expect(courtOverlaps([a, st({ id: "c", date: "2026-10-27" })]).clash.size).toBe(0);
  });
  it("calendar shows every planned day, sorted, and skips play-by rounds", () => {
    const rows = calendarRows([
      st({ id: "r2", name: "Round 2", date: "2026-10-27" }),
      st({ id: "r1", name: "Round 1", extraDays: [{ date: "2026-10-21", from: "17:00", to: "20:00", courtIds: ["c3"] }] }),
      st({ id: "pb", mode: "play_by", deadline: "2026-11-01" }),
      st({ id: "qf", name: "Quarterfinal", unit: "Men A", phase: "playoff", date: "2026-11-24", courtIds: ["c20", "c21", "c24"] }),
    ], () => "reserved");
    expect(rows.map((r) => r.date)).toEqual(["2026-10-20", "2026-10-21", "2026-10-27", "2026-11-24"]);
    expect(rows[1].entries[0]).toMatchObject({ stageId: "r1", from: "17:00", courtIds: ["c3"] });
    expect(rows[3].entries[0]).toMatchObject({ unit: "Men A", courtIds: ["c20", "c21", "c24"] });
  });
});

import { roundMatrix as rm } from "@/lib/smart-builder/schedule-view";
describe("roundMatrix (court × day grid)", () => {
  const day = (date: string) => ({ date, from: "18:00", to: "21:00", courtIds: ["1", "2", "3"] });
  const r = (id: string, name: string, d: string[], phase: "main" | "playoff" = "main") => ({ id, name, unit: "", mode: "scheduled" as const, deadline: "", date: d[0], from: "18:00", to: "21:00", courtIds: ["1", "2", "3"], extraDays: d.slice(1).map(day), phase });
  it("Round 1 Tue/Wed/Thu courts 1-3 18-21: 3x3 filled, no clash", () => {
    const r1 = r("a", "Round 1", ["2026-10-13", "2026-10-14", "2026-10-15"]);
    const r2 = r("b", "Round 2", ["2026-10-20", "2026-10-21", "2026-10-22"]);
    const m = rm(r1, [r1, r2]);
    expect(m.days).toEqual(["2026-10-13", "2026-10-14", "2026-10-15"]);
    expect(m.courts).toEqual(["1", "2", "3"]);
    expect(Object.values(m.cells).flatMap((x) => Object.values(x)).every((c) => c && c.from === "18:00" && c.to === "21:00" && !c.clash.length)).toBe(true);
    expect(rm(r2, [r1, r2]).first).toBe("2026-10-20");
  });
  it("unallocated court is empty, clash only in the overlapping cell", () => {
    const a = { ...r("a", "Round 1", ["2026-10-13", "2026-10-14"]), extraDays: [{ date: "2026-10-14", from: "18:00", to: "21:00", courtIds: ["1"] }] };
    const b = { ...r("b", "Round 2", ["2026-10-14"]), courtIds: ["1"] };
    const m = rm(a, [a, b]);
    expect(m.cells["2"]["2026-10-14"]).toBeNull();
    expect(m.cells["1"]["2026-10-14"]!.clash).toEqual(["Round 2"]);
    expect(m.cells["1"]["2026-10-13"]!.clash).toEqual([]);
  });
});
