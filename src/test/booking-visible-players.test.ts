import { describe, expect, it } from "vitest";
import { isVisitorWithoutLivePass } from "@/lib/booking-visible-players";

describe("booking player pickers hide visitors without a live pass", () => {
  const passHolders = new Set(["m-pass"]);

  it("hides a visitor with no live pass", () => {
    expect(isVisitorWithoutLivePass("visitor", "m-nopass", passHolders)).toBe(true);
  });

  it("keeps a visitor with a live day/3-day/month pass", () => {
    expect(isVisitorWithoutLivePass("visitor", "m-pass", passHolders)).toBe(false);
  });

  it("never hides ordinary members, admins or captains", () => {
    for (const role of ["member", "admin", "captain", null, undefined, ""]) {
      expect(isVisitorWithoutLivePass(role as any, "m-nopass", passHolders)).toBe(false);
    }
  });

  it("matches the role case-insensitively", () => {
    expect(isVisitorWithoutLivePass("Visitor", "m-nopass", passHolders)).toBe(true);
  });
});
