import { describe, expect, it } from "vitest";
import { playoffSlotOrder, sortGamesForSlots, type SlotDivision } from "@/lib/smart-builder/playoff-slot-order";
import { allocateSlots } from "@/lib/smart-builder/playoff-chain";

const D = (id: string, gender: "men" | "ladies", lv: number[]): SlotDivision => ({ id, label: id, gender, leagueLevels: lv });
const five = [D("menA", "men", [1, 2]), D("menB", "men", [3, 4]), D("menC", "men", [5, 6]), D("ladA", "ladies", [3, 4]), D("ladB", "ladies", [5, 6])];
const group = (id: string) => five.findIndex((d) => d.id === id) + 1;

describe("play-off court-slot order", () => {
  it("lower level first, Ladies before Men in a tier, strongest Men last (odd count)", () => {
    const r = playoffSlotOrder(five);
    expect(r.source).toBe("level");
    expect(r.tiers).toEqual([["ladB", "menC"], ["ladA", "menB"], ["menA"]]);
  });
  it("one tier shares a start time across several courts", () => {
    const r = playoffSlotOrder(five);
    const games = five.map((d) => ({ group_number: group(d.id), bracket_position: 1 }));
    const ordered = sortGamesForSlots(games, r.order, group);
    const slots = allocateSlots(ordered.length, { from: "10:00", to: "18:00", courtIds: [20, 21], minutes: 45, busy: [] });
    expect(ordered.map((g) => g.group_number)).toEqual([5, 3, 4, 2, 1]);
    expect(slots.slice(0, 2).map((s) => s!.time)).toEqual(["10:00", "10:00"]);
    expect(slots[4]!.time).toBe("11:30");
  });
  it("same order for QF, SF and Final games (bracket order kept within a draw)", () => {
    const r = playoffSlotOrder(five);
    for (const n of [4, 2, 1]) {
      const games = five.flatMap((d) => Array.from({ length: n }, (_, i) => ({ group_number: group(d.id), bracket_position: n - i })));
      const out = sortGamesForSlots(games, r.order, group);
      expect(out[0].group_number).toBe(5);
      expect(out[out.length - 1].group_number).toBe(1);
      expect(out.slice(0, n).map((g) => g.bracket_position)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });
  it("organiser order overrides the default", () => {
    expect(playoffSlotOrder(five, ["menA", "ladB"]).order).toEqual(["menA", "ladB", "menB", "menC", "ladA"]);
  });
  it("warns and keeps draw order when level metadata is missing or contradictory", () => {
    const r = playoffSlotOrder([D("a", "men", [1]), { id: "b", label: "b", gender: "men", leagueLevels: [null] }, D("c", "ladies", [1, 6])]);
    expect(r.source).toBe("draw_order");
    expect(r.order).toEqual(["a", "b", "c"]);
    expect(r.warnings.length).toBe(2);
  });
});
