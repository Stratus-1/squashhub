import { describe, expect, it } from "vitest";
import { initialMemberTip, memberSettlementTip } from "@/lib/bar/member-settlement-tip";
import { emptyTip } from "@/lib/bar/tips";
const grant = { id: "grant", name: "Grant" }, ann = { id: "ann", name: "Ann" };
describe("member account settlement tips", () => {
  it("starts with no tip and assigns the only person serving", () => {
    expect(initialMemberTip([grant])).toEqual({ mode: "none", value: "", staffId: "grant" });
  });
  it("R900 added as R1000 assigns the R100 tip to the sole server", () => {
    expect(memberSettlementTip(900, { mode: "total", value: "1000", staffId: "" }, [grant])).toEqual({ subtotal: 900, tip: 100, total: 1000, staffId: "grant" });
  });
  it("does not guess a recipient when two people are serving", () => {
    expect(initialMemberTip([grant, ann]).staffId).toBe("");
    expect(() => memberSettlementTip(900, { mode: "percent", value: "", staffId: "" }, [grant, ann])).toThrow();
  });
  it("selected serving person receives the optional 10% tip", () => {
    expect(memberSettlementTip(900, { mode: "percent", value: "", staffId: "ann" }, [grant, ann])).toMatchObject({ tip: 90, total: 990, staffId: "ann" });
  });
  it("no tip works without any serving person", () => {
    expect(memberSettlementTip(900, emptyTip, [])).toMatchObject({ tip: 0, total: 900, staffId: null });
  });
  it("rejects a recipient not currently serving", () => {
    expect(() => memberSettlementTip(900, { mode: "amount", value: "100", staffId: "other" }, [grant])).toThrow("currently serving");
  });
});