import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("src/pages/ClubAuth.tsx", "utf8");

describe("existing-member signup: explains why no unclaimed row matched", () => {
  it("asks the status check only after the unclaimed lookup returns nothing", () => {
    const empty = src.slice(src.indexOf("if (rows.length === 0) {"));
    expect(empty.indexOf("existing_member_signup_status")).toBeGreaterThan(-1);
    expect(empty.indexOf("existing_member_signup_status")).toBeLessThan(empty.indexOf("matchedMemberId = rows[0].id"));
  });
  it("already-linked emails get sign-in, Google and reset — never 'not found'", () => {
    expect(src).toMatch(/This email is already linked to a SquashHub account\./);
    const panel = src.slice(src.indexOf('existingStatus === "already_linked" && ('));
    const end = panel.indexOf("</form>") > 0 ? panel.indexOf("<form") : panel.length;
    const p = panel.slice(0, end);
    expect(p).toMatch(/GoogleSignInButton/);
    expect(p).toMatch(/setActiveTab\("login"\)/);
    expect(p).toMatch(/setShowReset\(true\)/);
  });
  it("unclaimed email with wrong number/phone gets a specific mismatch message", () => {
    expect(src).toMatch(/verification_mismatch/);
    expect(src).toMatch(/doesn't match what the club has on file/);
  });
  it("the status check returns only a status word (no names or details)", () => {
    const empty = src.slice(src.indexOf("if (rows.length === 0) {"), src.indexOf("setExistingStatus(null);\n"));
    expect(empty).not.toMatch(/masked_name|\.name\b/);
  });
});
