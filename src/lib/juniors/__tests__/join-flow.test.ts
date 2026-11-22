import { describe, expect, it } from "vitest";
import {
  ageOn, guardianProblem, isJuniorToken, juniorDetailsProblem, needsGuardian, parseDob, readJuniorPending, saveJuniorPending,
} from "../join-flow";
import { isSafeJoinPath } from "@/lib/tournaments/join-flow";

const today = new Date(2026, 10, 23); // 23 Nov 2026

class MemStore {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe("junior registration link", () => {
  it("needs a real date of birth", () => {
    expect(parseDob("2014-02-30")).toBeNull();
    expect(guardianProblem({}, today)).toMatch(/date of birth/);
    expect(guardianProblem({ dob: "2027-01-01" }, today)).toMatch(/valid date/);
  });

  it("works out age on the day", () => {
    expect(ageOn(parseDob("2008-11-24")!, today)).toBe(17);
    expect(ageOn(parseDob("2008-11-23")!, today)).toBe(18);
  });

  it("requires a parent's name, cell and consent under 18", () => {
    const u18 = { dob: "2014-05-01" };
    expect(needsGuardian(u18.dob, today)).toBe(true);
    expect(guardianProblem(u18, today)).toMatch(/parent or guardian's name/);
    expect(guardianProblem({ ...u18, parentName: "Anna Venter", parentPhone: "082 555 1234" }, today)).toMatch(/consent/);
    expect(guardianProblem({ ...u18, parentName: "Anna Venter", parentPhone: "082 555 1234", consent: true }, today)).toBeNull();
  });

  it("does not ask for a parent from 18", () => {
    expect(needsGuardian("2008-11-23", today)).toBe(false);
    expect(guardianProblem({ dob: "2008-11-23" }, today)).toBeNull();
  });

  it("new juniors need a full name and boy or girl", () => {
    const ok = { dob: "2008-01-01" };
    expect(juniorDetailsProblem({ ...ok, name: "Liam", gender: "male" }, today)).toMatch(/surname/);
    expect(juniorDetailsProblem({ ...ok, name: "Liam Venter" }, today)).toMatch(/boy or girl/);
    expect(juniorDetailsProblem({ ...ok, name: "Liam Venter", gender: "male" }, today)).toBeNull();
  });

  it("only real junior links are safe return paths", () => {
    expect(isJuniorToken("a1b2c3d4e5f6a1b2c3d4e5f6")).toBe(true);
    expect(isSafeJoinPath("/j/a1b2c3d4e5f6a1b2c3d4e5f6")).toBe(true);
    expect(isSafeJoinPath("/j/../admin")).toBe(false);
  });

  it("a saved claim survives the email round trip but expires after two days", () => {
    const store = new MemStore() as unknown as Storage;
    const token = "a1b2c3d4e5f6a1b2c3d4e5f6";
    saveJuniorPending({ token, clubId: "c1", kind: "claim", memberId: "m1", savedAt: 1000 }, store);
    expect(readJuniorPending(token, 2000, store)?.memberId).toBe("m1");
    expect(readJuniorPending(token, 1000 + 3 * 24 * 3600 * 1000, store)).toBeNull();
  });
});
