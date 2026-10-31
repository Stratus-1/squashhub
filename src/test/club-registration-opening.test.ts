import { describe, expect, it } from "vitest";
import { registrationOpeningSchema } from "@/components/auth/registration-opening";

const valid = { name: "Test Officer", email: "officer@example.org", role: "chairman", confirmed: true };
describe("registration-only opening declaration", () => {
  it("requires explicit confirmation", () => {
    expect(registrationOpeningSchema.safeParse({ ...valid, confirmed: false }).success).toBe(false);
  });
  it("accepts a chairman declaration", () => {
    expect(registrationOpeningSchema.parse(valid).role).toBe("chairman");
  });
  it("accepts a club administrator declaration", () => {
    expect(registrationOpeningSchema.parse({ ...valid, role: "administrator" }).role).toBe("administrator");
  });
  it("rejects other roles", () => {
    expect(registrationOpeningSchema.safeParse({ ...valid, role: "member" }).success).toBe(false);
  });
  it("requires contact details", () => {
    expect(registrationOpeningSchema.safeParse({ ...valid, email: "invalid" }).success).toBe(false);
    expect(registrationOpeningSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });
});