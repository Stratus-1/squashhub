import { describe, it, expect, beforeEach } from "vitest";
import { isSafeJoinPath, savePending, readPending, takeJoinReturn, clearPending, detailsProblem, joinPath } from "@/lib/tournaments/join-flow";

const CHAMP = "47997e49-9378-4a8e-a55c-82d0613cf4e8";

describe("tournament open entry link flow", () => {
  beforeEach(() => localStorage.clear());

  it("only accepts tournament join paths as the sign-in return target", () => {
    expect(isSafeJoinPath(`/t/${CHAMP}/join`)).toBe(true);
    expect(isSafeJoinPath(`/c/uit/t/${CHAMP}/join`)).toBe(true);
    expect(isSafeJoinPath("//evil.com/t/x/join")).toBe(false);
    expect(isSafeJoinPath("/club-admin")).toBe(false);
  });

  it("brings the player back to the same tournament after confirming their email", () => {
    savePending({ champId: CHAMP, clubId: "k", kind: "existing_unlisted", name: "Jan Smit", gender: "male", savedAt: Date.now() }, joinPath(CHAMP));
    expect(takeJoinReturn()).toBe(`/t/${CHAMP}/join`);
    expect(readPending(CHAMP)?.kind).toBe("existing_unlisted");
    clearPending(CHAMP);
    expect(readPending(CHAMP)).toBeNull();
    expect(takeJoinReturn()).toBeNull();
  });

  it("forgets a pending join after two days", () => {
    const old = Date.now() - 3 * 24 * 60 * 60 * 1000;
    savePending({ champId: CHAMP, clubId: "k", kind: "new", savedAt: old }, joinPath(CHAMP));
    expect(readPending(CHAMP)).toBeNull();
    expect(takeJoinReturn()).toBeNull();
  });

  it("a claim needs the listed profile it claims", () => {
    savePending({ champId: CHAMP, clubId: "k", kind: "claim", savedAt: Date.now() }, joinPath(CHAMP));
    expect(readPending(CHAMP)).toBeNull();
  });

  it("registration needs first name, surname and gender", () => {
    expect(detailsProblem({ name: "Jan", gender: "male" }, false)).toMatch(/surname/);
    expect(detailsProblem({ name: "Jan Smit" }, false)).toMatch(/gender/);
    expect(detailsProblem({ name: "Jan Smit", gender: "male", email: "x" }, true)).toMatch(/email/);
    expect(detailsProblem({ name: "Jan Smit", gender: "male", email: "jan@x.co.za" }, true)).toBeNull();
  });
});
