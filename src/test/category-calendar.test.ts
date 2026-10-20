import { describe, it, expect } from "vitest";
import { categoryCalendar, type CategoryCalendarFixture } from "@/lib/tournaments/category-calendar";

const fixtures: CategoryCalendarFixture[] = [
  { id: "b", group: 2, category: "Mens B", title: "Alex v Ben", date: "2026-10-20", time: "18:00", court: "Court 1", kind: "confirmed" },
  { id: "c", group: 4, category: "Mens C", title: "Chris v Dan", date: "2026-10-20", time: "18:45", court: "Court 2", kind: "confirmed" },
  { id: "deadline", group: 4, category: "Mens C", title: "Eli v Fred", date: "2026-10-29", time: null, court: null, kind: "play_by" },
  { id: "tbd", group: 2, category: "Mens B", title: "Gus v Hugo", date: null, time: null, court: null, kind: "confirmed" },
];
describe("shared tournament category calendar", () => {
  it("retains fixtures from every category", () => {
    expect(categoryCalendar(fixtures, 2).events.map((e) => e.id)).toEqual(["b", "c", "deadline"]);
  });
  it("emphasises only the selected category without removing others", () => {
    expect(categoryCalendar(fixtures, 4).events.map((e) => [e.id, e.highlighted])).toEqual([["b", false], ["c", true], ["deadline", true]]);
  });
  it("preserves saved times, courts, deadlines and undated games", () => {
    const before = structuredClone(fixtures);
    const result = categoryCalendar(fixtures, 2);
    expect(result.events[1]).toMatchObject({ date: "2026-10-20", time: "18:45", court: "Court 2" });
    expect(result.events[2]).toMatchObject({ date: "2026-10-29", time: null, kind: "play_by" });
    expect(result.unscheduled.map((e) => e.id)).toEqual(["tbd"]);
    expect(fixtures).toEqual(before);
  });
});