import { describe, it, expect } from "vitest";
import { entryDueCents, eventCount, ownEvents, feeBreakdownLabel } from "@/lib/tournaments/entry-fee";

const money = (c: number) => `R${(c / 100).toFixed(2)}`;
describe("entry fee per event", () => {
  it("1 event = old amount; legacy no-choice entry = 1 event", () => {
    expect(entryDueCents(15000, [1])).toBe(15000);
    expect(entryDueCents(15000, [])).toBe(15000);
    expect(entryDueCents(15000, null)).toBe(15000);
  });
  it("3 events = 3 x fee; duplicates ignored", () => {
    expect(entryDueCents(15000, [1, 3, 5])).toBe(45000);
    expect(eventCount([1, 1, 3])).toBe(2);
  });
  it("partner pays only the shared doubles event", () => {
    // B entered Men's Doubles (3) + Mixed (5); A covers Men's Doubles → B owes Mixed only.
    expect(ownEvents([3, 5], [3])).toBe(1);
    expect(entryDueCents(15000, [3, 5], [3])).toBe(15000);
    // fully covered single-event partner owes nothing
    expect(entryDueCents(15000, [3], [3])).toBe(0);
  });
  it("removing an event lowers the amount", () => {
    expect(entryDueCents(15000, [1, 3])).toBe(30000);
    expect(entryDueCents(15000, [1])).toBe(15000);
  });
  it("breakdown label", () => {
    expect(feeBreakdownLabel(15000, 2, money)).toBe("2 events × R150.00 = R300.00");
    expect(feeBreakdownLabel(15000, 1, money)).toBe("R150.00");
  });
});
