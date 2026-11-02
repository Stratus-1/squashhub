import { describe, it, expect } from "vitest";
import {
  FAMILY_PRIMARY_LABEL,
  FAMILY_ADDITIONAL_LABEL,
  familyDisplayName,
  suggestFamilyRole,
  remainingSlots,
  isFamilyFull,
  relationshipAllowed,
  dependentAgeAllowed,
  combinedFamilyTotal,
  proRatedAmount,
  type FamilyCategory,
} from "@/lib/family/family-package";

const primary: FamilyCategory = {
  id: "p",
  name: "Family Plan",
  annual_fee: 1600,
  family_role: "primary",
  family_max_additional: 3,
  family_allowed_relationships: ["spouse", "child"],
  family_dependent_max_age: 21,
};

describe("standard family names", () => {
  it("shows the system names regardless of the club's own wording", () => {
    expect(familyDisplayName(primary)).toBe(FAMILY_PRIMARY_LABEL);
    expect(familyDisplayName({ name: "Member of family", family_role: "additional" })).toBe(FAMILY_ADDITIONAL_LABEL);
    expect(familyDisplayName({ name: "Full member", family_role: null })).toBe("Full member");
  });
});

describe("migration suggestions", () => {
  it("suggests primary and additional from clear wording", () => {
    expect(suggestFamilyRole("Family Plan", "up to 4 people")).toBe("primary");
    expect(suggestFamilyRole("Member of family", null)).toBe("additional");
    expect(suggestFamilyRole("Family members - no fee", null)).toBe("additional");
  });
  it("never reclassifies standalone types", () => {
    expect(suggestFamilyRole("Family Discounted (Spouse) – External", null)).toBeNull();
    expect(suggestFamilyRole("Scholar", null)).toBeNull();
    expect(suggestFamilyRole("Junior", null)).toBeNull();
    expect(suggestFamilyRole("Student", null)).toBeNull();
  });
});

describe("capacity and eligibility", () => {
  it("counts remaining slots and warns when full", () => {
    expect(remainingSlots(primary, 1)).toBe(2);
    expect(isFamilyFull(primary, 3)).toBe(true);
    expect(isFamilyFull({ ...primary, family_max_additional: null }, 99)).toBe(false);
  });
  it("checks relationships and the optional dependent age limit", () => {
    expect(relationshipAllowed(primary, "spouse")).toBe(true);
    expect(relationshipAllowed(primary, "other")).toBe(false);
    expect(relationshipAllowed({ ...primary, family_allowed_relationships: [] }, "other")).toBe(true);
    expect(dependentAgeAllowed(primary, "child", 15)).toBe(true);
    expect(dependentAgeAllowed(primary, "child", 30)).toBe(false);
    expect(dependentAgeAllowed(primary, "spouse", 45)).toBe(true);
    expect(dependentAgeAllowed({ ...primary, family_dependent_max_age: null }, "child", 40)).toBe(true);
  });
});

describe("amounts", () => {
  it("adds up one combined total", () => {
    expect(combinedFamilyTotal(1600, 120, 2)).toBe(1840);
    expect(combinedFamilyTotal(1600, 0, 3)).toBe(1600);
  });
  it("pro-rates someone joining later in the season", () => {
    expect(proRatedAmount(1200, true, 7)).toBe(600);
    expect(proRatedAmount(1200, false, 7)).toBe(1200);
    expect(proRatedAmount(0, true, 7)).toBe(0);
  });
});

import { mainFamilyPackage, extraFamilyCandidates, familyPackageName } from "@/lib/family/family-package";

describe("more than one fee may add family members", () => {
  const cats: FamilyCategory[] = [
    { id: "h", name: "Honorary", annual_fee: 500, family_role: "primary" },
    { id: "f", name: "Family Package", annual_fee: 3000, family_role: "primary" },
    { id: "a", name: "Additional", annual_fee: 800, family_role: "additional" },
    { id: "z", name: "Life member", annual_fee: 0, family_role: null },
    { id: "s", name: "Senior", annual_fee: 1200, family_role: null },
  ];
  it("keeps the family-named fee as the main package by default", () => {
    expect(mainFamilyPackage(cats)?.id).toBe("f");
  });
  it("offers non-family fees as extras, including free ones like Life member", () => {
    expect(extraFamilyCandidates(cats, "f", "a").map((c) => c.id)).toEqual(["h", "z", "s"]);
  });
  it("never offers visitors, additional-family fees or non-membership charges as extras", () => {
    const mixed: FamilyCategory[] = [
      { id: "f", name: "Family Package", annual_fee: 3000, family_role: "primary" },
      { id: "a", name: "Additional Family Member", annual_fee: 0, family_role: null },
      { id: "v", name: "Visitor", annual_fee: 50, family_role: null },
      { id: "c", name: "Cleaning levy", annual_fee: 100, family_role: null },
      { id: "ho", name: "Honorary member", annual_fee: 0, family_role: null },
      { id: "ls", name: "Longstanding member", annual_fee: 0, family_role: null },
    ];
    expect(extraFamilyCandidates(mixed, "f", "").map((c) => c.id)).toEqual(["ho", "ls"]);
  });
  it("keeps the extra fee's own name for members", () => {
    expect(familyPackageName({ name: "Honorary" })).toBe("Honorary");
    expect(familyPackageName({ name: "Family Package" })).toBe("Family Package");
  });
});
