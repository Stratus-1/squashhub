import { describe, expect, it } from "vitest";
import { goBookBalanceTone, memberGoBookBalance } from "@/lib/gobook-member-balance";

describe("GoBook member-facing balance display", () => {
  it("shows Court Manager credit (negative raw) as a positive member balance", () => {
    expect(memberGoBookBalance(-298.36)).toBe(298.36);
  });

  it("shows an amount the member owes as negative", () => {
    expect(memberGoBookBalance(40)).toBe(-40);
  });

  it("keeps zero at zero", () => {
    expect(memberGoBookBalance(0)).toBe(0);
  });

  it("colours credit green, owing red and zero neutral", () => {
    expect(goBookBalanceTone(298.36)).toBe("success");
    expect(goBookBalanceTone(-40)).toBe("destructive");
    expect(goBookBalanceTone(0)).toBe("muted");
  });
});
