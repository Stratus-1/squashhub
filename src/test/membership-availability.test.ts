import { describe, expect, it } from "vitest";
import { mayApplyForMembership } from "@/lib/membership-availability";

describe("SLA membership application availability", () => {
  it("stops new applications when the SLA is unsigned", () => {
    expect(mayApplyForMembership(false)).toBe(false);
  });
  it("allows new applications after the SLA is signed", () => {
    expect(mayApplyForMembership(true)).toBe(true);
  });
  it("does not enable applications before availability is confirmed", () => {
    expect(mayApplyForMembership(undefined)).toBe(false);
    expect(mayApplyForMembership(null)).toBe(false);
    expect(mayApplyForMembership("true")).toBe(false);
  });
});