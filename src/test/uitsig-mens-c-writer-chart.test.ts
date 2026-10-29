import { describe, it, expect } from "vitest";
import { usesUitsigMensCRemainderChart } from "@/lib/tournaments/projected-court-fixtures";

const UITSIG_CHAMPS = "f954222a-0f0a-4d8c-ac7b-9c74042cc69e";

describe("Uitsig Men's C writer follows the approved chart", () => {
  it("applies to the 18-player, 5-round, 3-group Uitsig category", () => {
    expect(usesUitsigMensCRemainderChart(UITSIG_CHAMPS, 18, 5, 3)).toBe(true);
  });
  it("never applies to other tournaments or category shapes", () => {
    expect(usesUitsigMensCRemainderChart("00000000-0000-0000-0000-000000000000", 18, 5, 3)).toBe(false);
    expect(usesUitsigMensCRemainderChart(UITSIG_CHAMPS, 16, 5, 3)).toBe(false);
    expect(usesUitsigMensCRemainderChart(UITSIG_CHAMPS, 18, 5, 2)).toBe(false);
  });
});
