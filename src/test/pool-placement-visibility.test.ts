import { describe, it, expect } from "vitest";
import { usesPoolPlacement } from "@/components/club-admin/ClubChampsTab";

describe("placement option (snake / strength band) shows wherever there are pools", () => {
  it.each(["single_round_robin", "double_round_robin", "cross_league", "knockout"])("%s", (f) => expect(usesPoolPlacement(f, 1)).toBe(true));
  it("any format split into 2+ pools", () => expect(usesPoolPlacement("swiss", 2)).toBe(true));
  it("single-field Swiss has no pools to place into", () => expect(usesPoolPlacement("swiss", 1)).toBe(false));
});
