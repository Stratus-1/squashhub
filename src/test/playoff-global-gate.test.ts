import { describe, it, expect } from "vitest";
import { planAssumedSchedule, type AssumeGame } from "@/lib/tournaments/assumed-schedule";
import { playoffHeadingText } from "@/lib/smart-builder/playoff-placeholders";

const day = { date: "2026-10-10", from: "08:00", to: "22:00", courtIds: [1, 2, 3] };
const q = (id: string, unit: string, round: number, people: string[]): AssumeGame => ({ id, round, pool: null, unitKey: unit, doubles: false, people });
const po = (id: string, unit: string, phase: number, label: string): AssumeGame => ({ id, round: phase, pool: null, unitKey: unit, doubles: false, people: [], phase: 10 + phase, label, provisional: true });
const m = (t: string) => { const [h, mm] = t.split(":").map(Number); return h * 60 + mm; };

// Mixed weekend: Open Doubles has a short qualifying, Men's Singles a long one.
const games: AssumeGame[] = [
  q("od1", "Open", 1, ["a", "b"]), q("od2", "Open", 1, ["c", "d"]),
  ...Array.from({ length: 5 }, (_, r) => q(`ms${r}`, "Men", r + 1, ["x", "y"])), // same pair → sequential
  po("Open|SF|1", "Open", 1, "Semi-final 1"), po("Open|SF|2", "Open", 1, "Semi-final 2"), po("Open|F|1", "Open", 2, "Final"),
  po("Men|SF|1", "Men", 1, "Semi-final 1"), po("Men|SF|2", "Men", 1, "Semi-final 2"), po("Men|F|1", "Men", 2, "Final"),
];

describe("play-off global qualifying gate", () => {
  it("no play-off starts before the LAST qualifying game (any category) ends + gap; final follows semis + rest", () => {
    const r = planAssumedSchedule({ games, days: [day], singles: 30, doubles: 30, rest: 10, playoffStart: { mode: "after", gap: 20 } });
    expect(r.issues).toEqual([]);
    const at = Object.fromEntries(r.slots.map((s) => [s.id, s]));
    const lastQualEnd = Math.max(...r.slots.filter((s) => !s.provisional).map((s) => m(s.end)));
    for (const s of r.slots.filter((s) => s.provisional)) expect(m(s.time)).toBeGreaterThanOrEqual(lastQualEnd + 20);
    for (const u of ["Open", "Men"]) {
      const sfEnd = Math.max(m(at[`${u}|SF|1`].end), m(at[`${u}|SF|2`].end));
      expect(m(at[`${u}|F|1`].time)).toBeGreaterThanOrEqual(sfEnd + 10);
    }
  });
  it("a fixed playoff start later than qualifying is honoured", () => {
    const r = planAssumedSchedule({ games, days: [day], singles: 30, doubles: 30, rest: 0, playoffStart: { mode: "fixed", date: day.date, time: "19:00" } });
    expect(r.issues).toEqual([]);
    for (const s of r.slots.filter((s) => s.provisional)) expect(m(s.time)).toBeGreaterThanOrEqual(m("19:00"));
  });
  it("a fixed start earlier than qualifying can finish is a clear conflict, never an early playoff", () => {
    const r = planAssumedSchedule({ games, days: [day], singles: 30, doubles: 30, rest: 0, playoffStart: { mode: "fixed", date: day.date, time: "09:00" } });
    expect(r.slots).toEqual([]);
    expect(r.issues.join(" ")).toMatch(/qualifying cannot finish before the fixed playoff start/);
  });
  it("impossible window warns instead of producing an invalid schedule", () => {
    const r = planAssumedSchedule({ games, days: [{ ...day, to: "10:00" }], singles: 30, doubles: 30, rest: 0 });
    expect(r.slots).toEqual([]);
    expect(r.issues[0]).toMatch(/could not be placed/);
  });
});

describe("play-off headings name their event", () => {
  it("prefixes the category and keeps the seed pair", () => {
    expect(playoffHeadingText("Mens Singles · Singles", "Semi-final 1", "#1 vs #4")).toBe("Mens Singles · Semi-final 1 · #1 vs #4");
    expect(playoffHeadingText("Doubles Open · Doubles", "Semi-final 1", "Pool A #1 vs Pool B #2")).toBe("Doubles Open · Semi-final 1 · Pool A #1 vs Pool B #2");
    expect(playoffHeadingText(null, "Final", null)).toBe("Play-off · Final");
  });
});
