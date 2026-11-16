import { describe, it, expect } from "vitest";
import { inviteGenderFilter } from "@/lib/smart-builder/step-invite";

describe("invite gender filter follows the tournament's categories", () => {
  it("Mens + Ladies + Mixed (No Frills Doubles) invites everyone even if the old column says men", () => {
    expect(inviteGenderFilter("men", { "1": "men", "2": "ladies" }, 3)).toBeNull();
  });
  it("men and ladies categories together invite everyone", () => {
    expect(inviteGenderFilter("men", { "1": "men", "2": "ladies" }, 2)).toBeNull();
  });
  it("all-men categories invite men only", () => {
    expect(inviteGenderFilter("open", { "1": "men", "2": "men" }, 2)).toBe("men");
  });
  it("all-ladies categories invite ladies only", () => {
    expect(inviteGenderFilter("men", { "1": "ladies" }, 1)).toBe("ladies");
  });
  it("without category genders the tournament setting is used", () => {
    expect(inviteGenderFilter("men", null, 0)).toBe("men");
    expect(inviteGenderFilter("open", null, 0)).toBeNull();
  });
});
