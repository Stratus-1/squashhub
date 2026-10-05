import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isApplicationIncomplete, isSelfApplication } from "@/lib/membership-application";

/**
 * Two deliberately different onboarding flows:
 *  A) preloaded/imported member activation — claims an existing row, category locked, no joining fee;
 *  B) genuine New Member Application — row created by the applicant's own signup, category chosen, fees raised.
 * The discriminator is the membership ROW (created by this signup / pending application),
 * never "this email/person exists somewhere in SquashHub".
 */
const accountCreated = "2026-10-05T18:54:54.961Z";

describe("A vs B onboarding discriminator", () => {
  it("1. imported Durbanville member activating: not an application, category stays locked", () => {
    const imported = { role: "member", fee_category_id: "durbanville-cat", joined_at: "2026-02-01T00:00:00Z", is_pending_approval: false };
    expect(isSelfApplication(imported, accountCreated)).toBe(false);
    expect(isApplicationIncomplete(imported, accountCreated)).toBe(false);
  });

  it("2. brand-new person -> Nelspruit application (Sue Crafford +nsc evidence): incomplete until a category is saved", () => {
    // Exact row shape of the failed attempt: auto-numbered NSC400, pending, no category, created with the account.
    const sue = { role: "member", fee_category_id: null, joined_at: accountCreated, is_pending_approval: true, applied_at: null };
    expect(isSelfApplication(sue, accountCreated)).toBe(true);
    expect(isApplicationIncomplete(sue, accountCreated)).toBe(true);
    // Even after an admin approved the empty application it must still resume.
    expect(isApplicationIncomplete({ ...sue, is_pending_approval: false }, accountCreated)).toBe(true);
  });

  it("3. existing SquashHub person applying to a new club: pending row is a new application", () => {
    const olderAccount = "2026-05-01T00:00:00Z";
    const row = { role: "member", fee_category_id: null, joined_at: "2026-10-05T20:00:00Z", is_pending_approval: true };
    expect(isSelfApplication(row, olderAccount)).toBe(true);
    expect(isApplicationIncomplete(row, olderAccount)).toBe(true);
  });

  it("4. preloaded Nelspruit member activating: category preserved, not a new joiner", () => {
    const preloaded = { role: "member", fee_category_id: "individuals", joined_at: "2025-01-10T00:00:00Z" };
    expect(isSelfApplication(preloaded, accountCreated)).toBe(false);
    expect(isApplicationIncomplete(preloaded, accountCreated)).toBe(false);
  });

  it("5. an email/person match elsewhere never turns a new application into an activation", () => {
    const wiz = readFileSync("src/components/MemberOnboardingWizard.tsx", "utf8");
    // new-joiner decision is taken from the row, not from finding any matching record
    expect(wiz).toMatch(/isSelfApplication\(member, \(user as any\)\?\.created_at\)/);
    expect(wiz).toMatch(/setIsExistingMember\(!freshApplicant\)/);
    // category is only locked when the club record already holds one (flow A)
    expect(wiz).toMatch(/if \(member\.fee_category_id\) \{[\s\S]{0,120}setCategoryLocked\(true\)/);
    // dashboard no longer treats an auto-assigned member number as "application complete"
    const dash = readFileSync("src/pages/Dashboard.tsx", "utf8");
    expect(dash).toMatch(/isApplicationIncomplete\(myClubMember/);
  });
});
