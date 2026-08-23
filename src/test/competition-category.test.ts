import { describe, expect, it } from "vitest";
import {
  COMPETITION_CATEGORIES,
  COMPETITION_DISCIPLINES,
  categoryLabel,
  competitionLabel,
  inferCategory,
  isPlayerEligibleForCategory,
  normaliseGender,
  validatePairComposition,
} from "@/lib/leagues/category";
import { buildTeamNameIndex, fixtureSideName } from "@/lib/leagues/fixture-display";

describe("category options", () => {
  it("offers exactly Men's, Ladies, Mixed and Open", () => {
    expect(COMPETITION_CATEGORIES).toEqual(["mens", "ladies", "mixed", "open"]);
    expect(COMPETITION_CATEGORIES.map(categoryLabel)).toEqual(["Men's", "Ladies", "Mixed", "Open"]);
  });

  it("offers all four categories for Singles, Doubles and Hybrid", () => {
    expect(COMPETITION_DISCIPLINES).toEqual(["singles", "doubles", "hybrid"]);
    const combos = COMPETITION_DISCIPLINES.flatMap((d) =>
      COMPETITION_CATEGORIES.map((c) => competitionLabel(c, d)),
    );
    expect(combos).toHaveLength(12);
    expect(combos).toContain("Men's Doubles");
    expect(combos).toContain("Ladies Doubles");
    expect(combos).toContain("Mixed Doubles");
    expect(combos).toContain("Open Doubles");
    expect(combos).toContain("Open Hybrid");
  });

  it("only infers a category when it is provable", () => {
    expect(inferCategory("Ladies 1st")).toBe("ladies");
    expect(inferCategory("Mens 2nd")).toBe("mens");
    expect(inferCategory("Mixed 3rd")).toBe("mixed");
    expect(inferCategory("Open A")).toBe("open");
    expect(inferCategory("Division 4")).toBeNull();
    expect(inferCategory("")).toBeNull();
    expect(inferCategory(null)).toBeNull();
  });

  it("normalises the stored gender spellings", () => {
    expect(normaliseGender("Ladies")).toBe("female");
    expect(normaliseGender("F")).toBe("female");
    expect(normaliseGender("Men")).toBe("male");
    expect(normaliseGender("")).toBe("unknown");
  });
});

describe("eligibility by category", () => {
  it("gendered categories restrict individuals", () => {
    expect(isPlayerEligibleForCategory("Male", "mens")).toBe(true);
    expect(isPlayerEligibleForCategory("Ladies", "mens")).toBe(false);
    expect(isPlayerEligibleForCategory("Ladies", "ladies")).toBe(true);
    expect(isPlayerEligibleForCategory(null, "ladies")).toBe(false);
  });

  it("open and mixed never exclude an individual", () => {
    for (const g of ["Male", "Ladies", null]) {
      expect(isPlayerEligibleForCategory(g, "open")).toBe(true);
      expect(isPlayerEligibleForCategory(g, "mixed")).toBe(true);
    }
  });

  it("uncategorised legacy leagues restrict nobody", () => {
    expect(isPlayerEligibleForCategory("Ladies", null)).toBe(true);
  });
});

describe("pair composition (doubles is never gender-hard-coded)", () => {
  it("men's and ladies doubles require matching players", () => {
    expect(validatePairComposition(["Male", "Male"], "mens").valid).toBe(true);
    expect(validatePairComposition(["Male", "Ladies"], "mens").valid).toBe(false);
    expect(validatePairComposition(["Ladies", "Ladies"], "ladies").valid).toBe(true);
  });

  it("mixed only enforces mixed-gender when the rules require it", () => {
    expect(validatePairComposition(["Male", "Male"], "mixed").valid).toBe(true);
    const strict = validatePairComposition(["Male", "Male"], "mixed", { requireMixedPair: true });
    expect(strict.valid).toBe(false);
    expect(strict.reason).toMatch(/one male and one female/i);
    expect(validatePairComposition(["Male", "Ladies"], "mixed", { requireMixedPair: true }).valid).toBe(true);
  });

  it("open accepts any combination and is NOT treated as mixed", () => {
    for (const pair of [["Male", "Male"], ["Ladies", "Ladies"], ["Male", "Ladies"]]) {
      expect(validatePairComposition(pair, "open", { requireMixedPair: true }).valid).toBe(true);
    }
    expect(validatePairComposition(["Male", "Male"], "mixed", { requireMixedPair: true }).valid).toBe(false);
  });
});

describe("duplicate team codes across categories", () => {
  const teams = [
    { code: "CSI001", name: "Men's 2nd League 2026", category: "mens", division: "Mens 2nd" },
    { code: "CSI001", name: "Ladies 1st League 2026", category: "ladies", division: "Ladies 1st" },
    { code: "MXD001", name: "Mixed Cobras", category: "mixed" },
    { code: "OPN001", name: "Open Vipers", category: "open" },
  ];
  const index = buildTeamNameIndex(teams);

  it("keeps both same-code teams apart by category", () => {
    expect(index.byCategoryCode["MENS|CSI001"]).toBe("Men's 2nd League 2026");
    expect(index.byCategoryCode["LADIES|CSI001"]).toBe("Ladies 1st League 2026");
  });

  it("blanks the code-only fallback for the ambiguous code", () => {
    expect(index.byCode["CSI001"]).toBeUndefined();
    expect(index.byCode["MXD001"]).toBe("Mixed Cobras");
    expect(index.byCode["OPN001"]).toBe("Open Vipers");
  });

  it("resolves a fixture side using the fixture's category", () => {
    expect(
      fixtureSideName({ home_team_code: "CSI001", category: "ladies" }, "home", index),
    ).toBe("Ladies 1st League 2026");
    expect(
      fixtureSideName({ home_team_code: "CSI001", category: "mens" }, "home", index),
    ).toBe("Men's 2nd League 2026");
  });

  it("still prefers the division label when the fixture carries one", () => {
    expect(
      fixtureSideName({ home_team_code: "CSI001", division: "Mens 2nd", category: "ladies" }, "home", index),
    ).toBe("Men's 2nd League 2026");
  });

  it("falls back to the code (never a wrong name) when nothing disambiguates", () => {
    expect(fixtureSideName({ home_team_code: "CSI001" }, "home", index)).toBe("CSI001");
  });

  it("snapshots still win over any live lookup", () => {
    expect(
      fixtureSideName(
        { home_team_code: "CSI001", category: "mens", home_team_name_snapshot: "Old Men's 2nd" },
        "home",
        index,
      ),
    ).toBe("Old Men's 2nd");
  });
});
