import { describe, it, expect } from "vitest";
import { swissDivisionProgress } from "@/lib/tournaments/swiss-progress";
const div = (id: string) => ({ divisionId: id, label: id, stages: [{ id: "s", kind: "swiss", swissRounds: 6 }] });
const done = (a: string, b: string) => ({ a, b, round: 1, status: "completed", winner: a });
const plan2 = [{ name: "Round 1", phase: "main", mode: "scheduled", date: "2026-10-13", unit: "" }, { name: "Round 2", phase: "main", mode: "scheduled", date: "2026-10-20", unit: "" }];
describe("swiss progress", () => {
  it("bye with null opponent never blocks; existing Round 2 schedule → generate", () => {
    const r = swissDivisionProgress([div("B")], () => [done("a", "b"), { a: "w", b: null, round: 1, status: "scheduled" }], plan2)[0];
    expect(r.action).toBe("generate"); expect(r.current).toMatchObject({ done: 1, total: 1 });
  });
  it("no Round 2 schedule → set up round", () => {
    expect(swissDivisionProgress([div("A")], () => [done("a", "b")], plan2.slice(0, 1))[0].action).toBe("setup_round");
  });
  it("open match → wait with pending list", () => {
    const r = swissDivisionProgress([div("A")], () => [done("a", "b"), { a: "c", b: "d", round: 1, status: "scheduled" }], plan2)[0];
    expect(r.action).toBe("wait"); expect(r.current.pending).toHaveLength(1);
  });
  it("categories progress independently", () => {
    const rs = swissDivisionProgress([div("A"), div("B")], (di) => di === 0 ? [done("a", "b")] : [{ a: "c", b: "d", round: 1 }], plan2);
    expect(rs.map((r) => r.action)).toEqual(["generate", "wait"]);
  });
});

describe("swiss → play-off transition vs setup plan", () => {
  const rounds = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Round ${i + 1}`, phase: "main", mode: "scheduled", date: `2026-11-0${i + 1}`, unit: "" }));
  const po = [{ name: "Quarterfinal", phase: "playoff", mode: "scheduled", date: "2026-11-24", unit: "" }, { name: "Semifinal", phase: "playoff", mode: "scheduled", date: "2026-11-25", unit: "" }];
  const plan = [...rounds(5), ...po];
  const live = (id: string, extra: any = {}) => ({ divisionId: id, label: `${id} · Singles`, stages: [{ id: "s", kind: "swiss", swissRounds: 6, order: 0 }], ...extra });
  const through = (n: number, open = 0) => Array.from({ length: n }, (_, i) => [
    { a: "a", b: "b", round: i + 1, status: i + 1 === n && open ? "scheduled" : "completed", winner: i + 1 === n && open ? null : "a" },
  ]).flat();
  const setup5 = { stages: plan, format: { swissRounds: "5" }, formatOverrides: {} };

  it("Riverside Men's A: R5 final, setup 5 + QF, live draw 6 rounds → conflict, never a plain 'Set up Round 6'", () => {
    const r = swissDivisionProgress([live("Mens A")], () => through(5), plan, setup5)[0];
    expect(r.action).toBe("plan_conflict");
    expect(r.transition).toMatchObject({ kind: "conflict", reason: "live_rounds", setupRounds: 5, liveRounds: 6, liveHasPlayoff: false, playoffs: ["Quarterfinal", "Semifinal"] });
    expect(r.gate).toMatchObject({ state: "ready", nextRound: 6 }); // keep-6 path still available, never silently skipped
  });
  it("setup still says 6 Swiss rounds but QF follows Round 5 → setup conflict surfaced", () => {
    const r = swissDivisionProgress([live("Mens A")], () => through(5), plan, { ...setup5, format: { swissRounds: 6 } })[0];
    expect(r.transition).toMatchObject({ kind: "conflict", reason: "setup_rounds", setupRounds: 6, playoffAfterRound: 5 });
    expect((r.transition as any).message).toContain("6 Swiss rounds are configured, but Quarterfinal is set to follow Round 5");
  });
  it("category override wins over tournament format", () => {
    const r = swissDivisionProgress([live("Mens A")], () => through(5), plan, { ...setup5, format: { swissRounds: 6 }, formatOverrides: { "Mens A": { swissRounds: 5 } } })[0];
    expect(r.transition).toMatchObject({ reason: "live_rounds", setupRounds: 5 });
  });
  it("other categories unchanged: R2 in progress waits; R1 done with R2 scheduled → generate", () => {
    const rs = swissDivisionProgress([live("Mens B"), live("Mens C"), live("Ladies")], (di) => di === 0 ? through(2, 1) : through(1), plan, setup5);
    expect(rs.map((r) => r.action)).toEqual(["wait", "generate", "generate"]);
    expect(rs.every((r) => r.transition === null)).toBe(true);
  });
  it("all live rounds done and the live draw has a play-off stage → hand over to stage progression", () => {
    const d = live("Mens A", { stages: [{ id: "s", kind: "swiss", swissRounds: 5, order: 0 }, { id: "qf", kind: "knockout", order: 1, name: "Quarterfinal" }] });
    const r = swissDivisionProgress([d], () => through(5), plan, setup5)[0];
    expect(r.action).toBe("playoffs"); expect(r.transition).toEqual({ kind: "playoff_next", name: "Quarterfinal" });
  });
  it("all live rounds done, setup plans play-offs the live draw lacks → not_in_draw conflict instead of 'Final standings'", () => {
    const d = live("Mens A", { stages: [{ id: "s", kind: "swiss", swissRounds: 5, order: 0 }] });
    expect(swissDivisionProgress([d], () => through(5), plan, setup5)[0].transition).toMatchObject({ reason: "not_in_draw" });
  });
  it("no play-offs in setup → unchanged behaviour (setup_round / final)", () => {
    expect(swissDivisionProgress([live("Mens A")], () => through(5), rounds(5), { stages: rounds(5), format: { swissRounds: 6 } })[0].action).toBe("setup_round");
    expect(swissDivisionProgress([live("Mens A")], () => through(6), rounds(6), { stages: rounds(6), format: { swissRounds: 6 } })[0].action).toBe("final");
  });
});

describe("Riverside shape: QF/SF saved as Define-later on a 6-round live Swiss stage", () => {
  const plan = [...Array.from({ length: 5 }, (_, i) => ({ name: `Round ${i + 1}`, phase: "main", mode: "scheduled", date: "2026-11-01", unit: "" })),
    { name: "Quarterfinal", phase: "playoff", unit: "" }, { name: "Semifinal", phase: "playoff", unit: "" }];
  const d = { divisionId: "g1", label: "Mens A · Singles", stages: [{ id: "s", kind: "swiss", swissRounds: 6, order: 0 }], deferredStages: [{ name: "Quarterfinal" }, { name: "Semifinal" }] };
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ a: "a", b: "b", round: i + 1, status: "completed", winner: "a" }));
  it("after R5 → conflict naming the saved QF that only unlocks after Round 6", () => {
    const r = swissDivisionProgress([d], () => rows(5), plan, { stages: plan, format: { swissRounds: "5" } })[0];
    expect(r.action).toBe("plan_conflict");
    expect(r.transition).toMatchObject({ reason: "live_rounds", liveHasPlayoff: true, setupRounds: 5, liveRounds: 6 });
    expect((r.transition as any).message).toContain("only becomes available after Round 6");
  });
  it("before R5 nothing changes", () => {
    expect(swissDivisionProgress([d], () => rows(3), plan, { stages: plan, format: { swissRounds: "5" } })[0].transition).toBeNull();
  });
  it("after all 6 live rounds → hand over to the QF stage", () => {
    expect(swissDivisionProgress([d], () => rows(6), plan, { stages: plan, format: { swissRounds: "5" } })[0]).toMatchObject({ action: "playoffs", transition: { kind: "playoff_next", name: "Quarterfinal" } });
  });
});
