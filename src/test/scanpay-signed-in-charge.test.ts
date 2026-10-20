import { describe, expect, it } from "vitest";
import { accountChargeStart } from "@/lib/bar/member-tab-handoff";

describe("scan-to-pay member-account charge start", () => {
  it("skips the number step when the signed-in member is confirmed at the scanned club", () => {
    expect(accountChargeStart({ id: "m1", name: "Jan" }, { id: "m1", name: "Jan" })).toEqual({
      mode: "otp", memberId: "m1", memberName: "Jan",
    });
  });
  it("falls back to the member's own name when the club record has none", () => {
    expect(accountChargeStart({ id: "m1", name: "Jan" }, { id: "m1", name: null })).toEqual({
      mode: "otp", memberId: "m1", memberName: "Jan",
    });
  });
  it("keeps the number step when nobody is signed in", () => {
    expect(accountChargeStart(null, { id: "m1", name: "Jan" })).toEqual({ mode: "number" });
  });
  it("keeps the number step when the signed-in person is not an active member of the scanned club", () => {
    expect(accountChargeStart({ id: "m1", name: "Jan" }, null)).toEqual({ mode: "number" });
  });
  it("keeps the number step when the confirmed membership belongs to a different member", () => {
    expect(accountChargeStart({ id: "m1", name: "Jan" }, { id: "m2", name: "Piet" })).toEqual({ mode: "number" });
  });
});
