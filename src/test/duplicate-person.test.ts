import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { classifyMatch, phoneTail, revealableAccounts, sameName } from "../../supabase/functions/_shared/person-match";

const existing = [{ name: "Fanus Coetzee", phone: "+27 64 048 9013", user_id: "u1", email: "fanus@x.co.za" }];

describe("duplicate-person safeguard", () => {
  it("normalises South African phone formats", () => {
    for (const p of ["0640489013", "+27 64 048 9013", "064-048-9013", "0027640489013", "(064) 048 9013"])
      expect(phoneTail(p)).toBe("640489013");
    expect(phoneTail("123")).toBeNull();
  });
  it("exact duplicate: same name + same cell -> exact", () => {
    expect(classifyMatch({ name: "fanus  COETZEE", phone: "064 048 9013" }, existing)).toBe("exact");
  });
  it("same phone with formatting differences, different name -> phone (strong)", () => {
    expect(classifyMatch({ name: "Marie Coetzee", phone: "+27-64-048-9013" }, existing)).toBe("phone");
  });
  it("same name, different phone -> only a possible match", () => {
    expect(classifyMatch({ name: "Fanus Coetzee", phone: "0821112222" }, existing)).toBe("name");
  });
  it("two legitimate people with the same name are never blocked (name level only)", () => {
    const twins = [...existing, { name: "Fanus Coetzee", phone: "0839998888", user_id: "u2" }];
    expect(classifyMatch({ name: "Fanus Coetzee", phone: "0710000000" }, twins)).toBe("name");
  });
  it("accents and middle names still match on first + last", () => {
    expect(sameName("Andrés Pieter du Toit", "andres toit")).toBe(true);
  });
  it("privacy: only accounts on the verified number are revealable", () => {
    const list = [...existing, { name: "Other", phone: "0821112222", user_id: "u3", email: "o@x.co.za" }];
    expect(revealableAccounts("064 048 9013", list).map((a) => a.email)).toEqual(["fanus@x.co.za"]);
    expect(revealableAccounts("", list)).toEqual([]);
  });
  it("privacy before OTP: the check response carries no names or emails", () => {
    const src = readFileSync("supabase/functions/account-recovery/index.ts", "utf8");
    const check = src.slice(src.indexOf('action === "check"'), src.indexOf('action === "send_code"'));
    expect(check).toMatch(/json\(\{ level, has_login \}\)/);
    expect(check).not.toMatch(/email/);
    // emails are only read after a correct, unexpired, unconsumed code
    const verify = src.slice(src.indexOf('action === "verify_code"'));
    expect(verify.indexOf("code_hash !==")).toBeLessThan(verify.indexOf("getUserById"));
  });
  it("every self-registration entry point runs the guard", () => {
    const club = readFileSync("src/pages/ClubAuth.tsx", "utf8");
    expect(club.match(/dup\.guard\(/g)?.length).toBeGreaterThanOrEqual(4); // new, visitor, visitor+Google, league number
    expect(club).not.toMatch(/check_member_duplicate_hint/);
    expect(readFileSync("src/pages/LeagueSignup.tsx", "utf8")).toMatch(/dup\.guard\(/);
    expect(readFileSync("src/components/NoClubAccess.tsx", "utf8")).toMatch(/dup\.guard\(/);
  });
});
