import { describe, expect, it } from "vitest";
import {
  emptyFamilyDraft,
  familyDraftError,
  familyDraftLabel,
  familyDraftPayload,
  type FamilyDraft,
} from "@/lib/family/family-draft";
import type { FamilyCategory } from "@/lib/family/family-package";

const primary: FamilyCategory = {
  id: "p",
  name: "Family Plan",
  annual_fee: 1600,
  family_role: "primary",
  family_max_additional: 3,
  family_allowed_relationships: ["spouse", "child"],
  family_additional_category_id: "a",
};

const person = (over: Partial<FamilyDraft> = {}): FamilyDraft => ({
  ...emptyFamilyDraft(),
  name: "Anna",
  surname: "Pretorius",
  email: "anna@example.com",
  relationship: "child",
  ...over,
});

describe("family drafts in the joining wizard", () => {
  it("accepts an empty list", () => {
    expect(familyDraftError(primary, [])).toBeNull();
  });

  it("accepts a complete person", () => {
    expect(familyDraftError(primary, [person()])).toBeNull();
  });

  it("blocks more people than the package includes", () => {
    const four = [person(), person(), person(), person()];
    expect(familyDraftError(primary, four)).toMatch(/up to 3/);
  });

  it("blocks a relationship the club excludes", () => {
    expect(familyDraftError(primary, [person({ relationship: "other" })])).toMatch(/relationship/);
  });

  it("requires a way to contact a new person", () => {
    expect(familyDraftError(primary, [person({ email: "", phone: "" })])).toMatch(/email address/);
  });

  it("requires a member number for an existing member", () => {
    expect(familyDraftError(primary, [person({ mode: "existing", memberNo: "" })])).toMatch(/membership number/);
  });

  it("explains when the club has no additional fee configured", () => {
    expect(
      familyDraftError({ ...primary, family_additional_category_id: null }, [person()]),
    ).toMatch(/additional family member fee/);
  });

  it("builds the add payload for a new person", () => {
    expect(familyDraftPayload("me", person())).toEqual({
      _primary_member_id: "me",
      _existing_member_id: null,
      _name: "Anna Pretorius",
      _email: "anna@example.com",
      _phone: null,
      _relationship: "child",
    });
  });

  it("labels rows for the list", () => {
    expect(familyDraftLabel(person())).toBe("Anna Pretorius");
    expect(familyDraftLabel(person({ mode: "existing", memberNo: "NSC112" }))).toBe("NSC112");
  });
});
