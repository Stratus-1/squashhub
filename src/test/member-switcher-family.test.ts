import { describe, expect, it } from "vitest";
import { familyOf, type LinkedMember } from "@/contexts/MemberContext";

const m = (id: string, user_id: string | null, email: string | null): LinkedMember =>
  ({ id, name: id, email, club_member_number: null, gender: null, user_id });

const admin = m("admin", "u-admin", "willem@x.co");
const jan = m("jan", "u-goosen", "goosen@x.co");
const ebert = m("ebert", "u-goosen", "GOOSEN@x.co");
const zelda = m("zelda", null, "goosen@x.co");
const other = m("other", "u-other", "other@x.co");
const all = [admin, jan, ebert, zelda, other];

describe("familyOf (Switch Member tabs while viewing as)", () => {
  it("shows the viewed member's family on the same login or email", () => {
    expect(familyOf(jan, [admin], all).map((x) => x.id)).toEqual(["jan", "ebert", "zelda"]);
  });
  it("keeps the admin's own family when not viewing as someone else", () => {
    expect(familyOf(admin, [admin], all).map((x) => x.id)).toEqual(["admin"]);
  });
  it("a member with no family gets a single tab (switcher hidden)", () => {
    expect(familyOf(other, [admin], all).map((x) => x.id)).toEqual(["other"]);
  });
});
