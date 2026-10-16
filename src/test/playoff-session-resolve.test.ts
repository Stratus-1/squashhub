import { describe, it, expect } from "vitest";
import { resolvePlayoffSessions } from "@/lib/smart-builder/playoff-schedule";

const fx = (date: string, from?: string, to?: string, courts?: number[]) => ({ rule: "fixed", date, ...(from ? { timeFrom: from, timeTo: to, courtIds: courts } : {}) });
const spec: any = { divisions: [
  { divisionId: "m", group: 1, stages: [{ id: "x-main", order: 0, name: "Pools" }, { id: "x-po1", order: 1, name: "Semifinal", schedule: fx("2026-11-14") }, { id: "x-po3", order: 2, name: "Final", schedule: fx("2026-11-14", "19:00", "21:00", [20, 21]) }] },
  { divisionId: "l", group: 2, stages: [{ id: "x-main", order: 0, name: "Swiss" }, { id: "x-po1", order: 1, name: "Quarterfinal", schedule: fx("2026-11-14") }, { id: "x-po2", order: 2, name: "Semifinal", schedule: fx("2026-11-14", "15:00", "19:00", [20, 21, 24]) }, { id: "x-po3", order: 3, name: "Final", schedule: fx("2026-11-14", "19:00", "21:00", [20, 21]) }] },
] };

describe("play-off sessions from Stages & scheduling", () => {
  it("men's semi-final without its own times uses the shared Semifinal session 15:00-19:00", () => {
    const r = resolvePlayoffSessions(spec);
    const sf = r.find((s) => s.schedule.timeFrom === "15:00")!;
    expect(sf.keys).toEqual(expect.arrayContaining([{ group: 1, stageId: "x-po1" }, { group: 2, stageId: "x-po2" }]));
    const fin = r.find((s) => s.schedule.timeFrom === "19:00")!;
    expect(fin.keys).toHaveLength(2);
  });
  it("a round with no times anywhere is not scheduled", () => {
    expect(resolvePlayoffSessions(spec).some((s) => s.keys.some((k) => k.group === 2 && k.stageId === "x-po1"))).toBe(false);
  });
});
