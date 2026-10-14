import { describe, it, expect } from "vitest";
import { generateCategoryDraw, resolveCategoryDraw, recordDrawResult, scheduleDraws, scheduleConflicts, type CategoryDraw, type DrawResults } from "@/lib/tournaments/swiss-positional-draw";

const ents = (n: number, p = "P") => Array.from({ length: n }, (_, i) => ({ id: `${p}${i + 1}`, name: `${p} Player ${i + 1}` }));
const draw = (n: number, rounds: number, key = `c${n}`) => generateCategoryDraw({ categoryKey: key, label: key, entrants: ents(n, key), rounds });

/** Play every round: better seed (lower id number) wins unless `upset` says otherwise. */
function playAll(d: CategoryDraw, upset = (_r: number) => false): DrawResults {
  let res: DrawResults = {};
  for (let r = 1; r <= d.rounds; r++) {
    const rd = resolveCategoryDraw(d, res).rounds[r - 1];
    for (const f of rd.fixtures) {
      const seedOf = (id: string) => Number(id.replace(/^\D+\d*?(?=\d+$)/, "").match(/\d+$/)![0]);
      const better = seedOf(f.a!.id) < seedOf(f.b!.id) ? "a" : "b";
      res = recordDrawResult(d, res, f.key, upset(r) ? (better === "a" ? "b" : "a") : better, "3-1");
    }
  }
  return res;
}

describe("full positional Swiss draw — generated once", () => {
  for (let n = 8; n <= 32; n++) {
    it(`${n} entrants: every round complete, no duplicate slots, valid byes`, () => {
      const rounds = Math.ceil(Math.log2(n));
      const d = draw(n, rounds);
      expect(d.issues).toEqual([]);
      for (let r = 1; r <= rounds; r++) {
        const fx = d.fixtures.filter((f) => f.round === r);
        const slots = fx.flatMap((f) => [f.slotA, f.slotB]);
        const bye = d.byes.filter((b) => b.round === r);
        expect(fx.length).toBe(Math.floor(n / 2));
        expect(bye.length).toBe(n % 2);
        const all = [...slots, ...bye.map((b) => b.slot)];
        expect(new Set(all).size).toBe(n);
        expect(fx.every((f) => f.slotA < f.slotB)).toBe(true);
      }
      // full play-through: everyone still placed exactly once
      const res = playAll(d, (r) => r === 1);
      const out = resolveCategoryDraw(d, res);
      expect(out.issues).toEqual([]);
      const ids = out.finalRanking.map((x) => x.entrant?.id);
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(n);
    });
  }

  it("rejects counts outside 8–32 and duplicate entrants visibly", () => {
    expect(draw(7, 3).fixtures).toEqual([]);
    expect(draw(33, 6).issues.length).toBeGreaterThan(0);
    const dup = generateCategoryDraw({ categoryKey: "x", label: "x", entrants: [...ents(9), { id: "P1", name: "dup" }], rounds: 3 });
    expect(dup.issues.join(" ")).toMatch(/only once/);
  });

  it("10/15/24 categories keep their own round counts", () => {
    const a = draw(10, 4), b = draw(15, 5), c = draw(24, 6);
    expect([a, b, c].map((d) => Math.max(...d.fixtures.map((f) => f.round)))).toEqual([4, 5, 6]);
    expect(a.fixtures.length).toBe(5 * 4);
    expect(b.fixtures.length).toBe(7 * 5);
    expect(b.byes.map((y) => y.slot)).toEqual([15, 15, 15, 15, 15]);
    expect(c.fixtures.length).toBe(12 * 6);
  });
});

describe("result progression and unresolved names", () => {
  it("unknown future players show as Position X vs Position Y (TBD)", () => {
    const d = draw(24, 5);
    const out = resolveCategoryDraw(d, {});
    expect(out.rounds[0].fixtures[0].label).toBe("c24 Player 1 vs c24 Player 24");
    const r2 = out.rounds[1].fixtures[0];
    expect(r2.status).toBe("awaiting");
    expect(r2.label).toBe(`Position ${r2.slotA} vs Position ${r2.slotB} (TBD)`);
  });

  it("winner takes better slot, loser worse slot, immediately on one result", () => {
    const d = draw(16, 4);
    // R1 1v16 — seed 16 wins upset.
    let res = recordDrawResult(d, {}, "r1-1v16", "b", "3-0");
    const out = resolveCategoryDraw(d, res);
    expect(out.occupancy[1][0]?.id).toBe("c1616");
    expect(out.occupancy[1][15]?.id).toBe("c161");
    // R2 slot 1 plays slot 8; slot 8 still unknown until R1 8v9 is decided.
    const f = out.rounds[1].fixtures.find((x) => x.slotA === 1)!;
    expect(f.a?.id).toBe("c1616");
    expect(f.b).toBeNull();
    expect(f.label).toBe("c16 Player 16 vs Position 8 (TBD)");
    res = recordDrawResult(d, res, "r1-8v9", "a");
    expect(resolveCategoryDraw(d, res).rounds[1].fixtures.find((x) => x.slotA === 1)!.status).toBe("ready");
  });

  it("refuses results before both players are known; same result is idempotent", () => {
    const d = draw(10, 4);
    expect(() => recordDrawResult(d, {}, d.fixtures.find((f) => f.round === 2)!.key, "a")).toThrow(/Both players/);
    const once = recordDrawResult(d, {}, "r1-1v10", "a", "3-0");
    expect(recordDrawResult(d, once, "r1-1v10", "a", "3-0")).toBe(once);
  });

  it("blocks changing a result after a later fixture it feeds is decided", () => {
    const d = draw(8, 3);
    let res: DrawResults = {};
    for (const f of resolveCategoryDraw(d, res).rounds[0].fixtures) res = recordDrawResult(d, res, f.key, "a");
    const r2 = resolveCategoryDraw(d, res).rounds[1].fixtures[0];
    res = recordDrawResult(d, res, r2.key, "a");
    expect(() => recordDrawResult(d, res, "r1-1v8", "b")).toThrow(/later match/);
  });

  it("bye occupant carries into the next round in the same slot", () => {
    const d = draw(15, 4);
    const out = resolveCategoryDraw(d, playAll(d));
    expect(out.rounds[0].bye?.entrant?.id).toBe("c1515");
    expect(out.occupancy[1][14]?.id).toBe("c1515");
  });

  it("reports rematches instead of hiding them", () => {
    const d = draw(10, 6);
    const out = resolveCategoryDraw(d, playAll(d));
    expect(Array.isArray(out.rematches)).toBe(true);
    for (const r of out.rematches) expect(r.a).not.toBe(r.b);
  });
});

describe("scheduling planned slots", () => {
  const courts = [{ id: 1, name: "Court 1" }, { id: 2, name: "Court 2" }, { id: 3, name: "Court 3" }];

  it("no court double-booking, respects existing bookings and rest when rounds share a date", () => {
    const d1 = draw(10, 4, "A"), d2 = draw(15, 5, "B");
    const opts = {
      roundDates: { A: ["2026-11-04", "2026-11-04", "2026-11-11", "2026-11-18"], B: ["2026-11-04", "2026-11-11", "2026-11-11", null, null] },
      playBy: { B: [null, null, null, "2026-11-25", null] },
      courts, times: ["17:00", "17:45", "18:30", "19:15", "20:00", "20:45", "21:30"], matchMinutes: 45, restMinutes: 45,
      busy: [{ date: "2026-11-04", time: "17:00", courtId: 1 }],
    };
    const s = scheduleDraws([d1, d2], opts);
    expect(scheduleConflicts([d1, d2], s, opts)).toEqual([]);
    expect(s["A:r1-1v10"]).toMatchObject({ kind: "planned", date: "2026-11-04" });
    expect(Object.values(s).some((x) => x.kind === "planned" && x.date === "2026-11-04" && x.time === "17:00" && x.courtId === 1)).toBe(false);
    expect(s[`B:${d2.fixtures.find((f) => f.round === 4)!.key}`]).toEqual({ kind: "play_by", date: "2026-11-25" });
    expect(s[`B:${d2.fixtures.find((f) => f.round === 5)!.key}`]).toMatchObject({ kind: "unscheduled" });
  });

  it("reports unplaceable fixtures rather than inventing slots", () => {
    const d = draw(24, 6, "C");
    const opts = { roundDates: { C: Array(6).fill("2026-11-04") }, courts: [courts[0]], times: ["18:00", "19:00"], matchMinutes: 45, restMinutes: 30 };
    const s = scheduleDraws([d], opts);
    expect(Object.values(s).filter((x) => x.kind === "planned").length).toBe(2);
    expect(Object.values(s).filter((x) => x.kind === "unscheduled").length).toBe(d.fixtures.length - 2);
    expect(scheduleConflicts([d], s, opts)).toEqual([]);
  });

  it("conflict checker catches a manual clash", () => {
    const d = draw(8, 3, "D");
    const bad = { "D:r1-1v8": { kind: "planned", date: "2026-11-04", time: "18:00", courtId: 1, courtName: "C1" }, "D:r1-2v7": { kind: "planned", date: "2026-11-04", time: "18:00", courtId: 1, courtName: "C1" } } as const;
    expect(scheduleConflicts([d], bad as never, { matchMinutes: 45, restMinutes: 30 }).length).toBe(1);
  });
});
