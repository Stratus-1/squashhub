import { describe, expect, it } from "vitest";
import { emptyTip, remainingTips, tipQuote } from "@/lib/bar/tips";
describe("bar tip amounts", () => {
  it("offers 10% of sale subtotal", () => expect(tipQuote(900, { mode: "percent", value: "", staffId: "grant" })).toEqual({ subtotal: 900, tip: 90, total: 990 }));
  it("R900 paid as R1000 means R100 tip", () => expect(tipQuote(900, { mode: "total", value: "1000", staffId: "grant" })).toEqual({ subtotal: 900, tip: 100, total: 1000 }));
  it("adds a specified rand amount", () => expect(tipQuote(900, { mode: "amount", value: "100", staffId: "grant" }).total).toBe(1000));
  it("no tip leaves sale unchanged", () => expect(tipQuote(900, emptyTip).tip).toBe(0));
  it("rounds 10% to cents", () => expect(tipQuote(99.95, { mode: "percent", value: "", staffId: "grant" }).tip).toBe(10));
  it("rejects a total below R900", () => expect(() => tipQuote(900, { mode: "total", value: "899", staffId: "grant" })).toThrow());
  it("requires named staff for positive tips", () => expect(() => tipQuote(900, { mode: "percent", value: "", staffId: "" })).toThrow());
  it.each(["-1", "NaN", "Infinity", "100.001", ""])('rejects invalid monetary input %s', value => expect(() => tipQuote(900, { mode: "amount", value, staffId: "grant" })).toThrow());
  it("R100 earned and R50 cash paid leaves R50", () => expect(remainingTips(100, 0, 50)).toBe(50));
  it("carries unpaid tips forward", () => expect(remainingTips(100, 50)).toBe(50));
  it("rejects paying more than staff credit", () => expect(() => remainingTips(100, 50, 51)).toThrow());
});