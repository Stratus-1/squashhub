import { describe, it, expect } from "vitest";
import { applicationStatus, isApplicationIncomplete, isSelfApplication } from "@/lib/membership-application";

const created = "2026-10-05T18:54:54.961Z";

describe("new member application state", () => {
  it("auto-numbered signup with no category is still incomplete (Nelspruit regression)", () => {
    const row = { role: "member", fee_category_id: null, joined_at: created, is_pending_approval: false };
    expect(isApplicationIncomplete(row, created)).toBe(true);
  });
  it("pending application without category is incomplete", () => {
    expect(isApplicationIncomplete({ role: "member", is_pending_approval: true }, null)).toBe(true);
  });
  it("saved application (category chosen) is complete", () => {
    expect(isApplicationIncomplete({ role: "member", fee_category_id: "c1", is_pending_approval: true }, created)).toBe(false);
  });
  it("imported member without category logging in later is not treated as a new applicant", () => {
    const row = { role: "member", fee_category_id: null, joined_at: "2026-03-01T00:00:00Z" };
    expect(isSelfApplication(row, created)).toBe(false);
    expect(isApplicationIncomplete(row, created)).toBe(false);
  });
  it("signup that saved its details (Highveld June self-signups) is complete even with no category — no repeat onboarding loop", () => {
    // Gerrit Oosthuizen HSC0003: wizard final save wrote phone + ID + gender; the club had no category then.
    const row = { role: "member", fee_category_id: null, joined_at: created, is_pending_approval: false, phone: "+27824526083", id_number: "8511075012086", gender: "Men" };
    expect(isApplicationIncomplete(row, created)).toBe(false);
  });
  it("phone-only self-signup (details never saved) still resumes onboarding", () => {
    const row = { role: "member", fee_category_id: null, joined_at: created, is_pending_approval: false, phone: "0766026084" };
    expect(isApplicationIncomplete(row, created)).toBe(true);
  });
  it("each of phone, ID number and gender is required as saved-details evidence", () => {
    for (const partial of [
      { phone: "082", id_number: "8501015009083" },
      { phone: "082", gender: "Men" },
      { id_number: "8501015009083", gender: "Men" },
    ])
      expect(isApplicationIncomplete({ role: "member", joined_at: created, ...partial }, created)).toBe(true);
  });
  it("visitors, admins and billing-exempt rows are never pushed into the application", () => {
    for (const r of [{ role: "visitor" }, { role: "admin" }, { role: "member", billing_exempt: true }])
      expect(isApplicationIncomplete({ ...r, is_pending_approval: true }, created)).toBe(false);
  });
  it("admin status distinguishes incomplete / awaiting payment / awaiting approval", () => {
    expect(applicationStatus({ role: "member" }, { unpaidJoiningFees: 0 })).toBe("incomplete");
    expect(applicationStatus({ role: "member", fee_category_id: "c" }, { unpaidJoiningFees: 2 })).toBe("awaiting_payment");
    expect(applicationStatus({ role: "member", fee_category_id: "c" }, { unpaidJoiningFees: 0 })).toBe("awaiting_approval");
  });
});
