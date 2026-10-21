import { describe, expect, it } from "vitest";
import { roundCountCheck } from "@/lib/smart-builder/round-count-check";

const units = [{ key: "Mens::A", base: "Mens › A" }, { key: "Mens::B", base: "Mens › B" }, { key: "Ladies", base: "Ladies" }, { key: "Plate", base: "Plate" }];
const answers = { stagePlans: {
  "Mens::A": [{ id: "1", kind: "swiss" as const, rounds: 5, rrFinish: { enabled: true, groups: 3 } }],
  "Mens::B": [{ id: "2", kind: "swiss" as const, rounds: 4 }],
  Ladies: [{ id: "3", kind: "swiss" as const, rounds: 3 }],
  Plate: [{ id: "4", kind: "knockout" as const }],
} } as any;
const st = (unit: string, extra: any = {}) => ({ unit, phase: "main", mode: "later", ...extra });

describe("Stages & scheduling round count per category", () => {
  it("shared rounds count for every category; each category checked against its own count", () => {
    const stages = [st(""), st(""), st("", { mode: "play_by", deadline: "2026-11-01" }), st("Mens"), st("Mens::A"), st("Mens", { phase: "playoff" })];
    const r = roundCountCheck(answers, units, stages);
    expect(r.map((x) => [x.key, x.required, x.created, x.dated])).toEqual([["Mens::A", 5, 5, 1], ["Mens::B", 4, 4, 1], ["Ladies", 3, 3, 1]]);
    expect(r.every((x) => x.problem === null)).toBe(true);
  });
  it("names missing and excess rounds per category", () => {
    const r = roundCountCheck(answers, units, [st(""), st(""), st(""), st(""), st("Ladies")]);
    expect(r.find((x) => x.key === "Mens::A")!.problem).toBe("Mens › A: 4 of 5 rounds created; add Round 5. Rounds 3–5 are the group round robin.");
    expect(r.find((x) => x.key === "Mens::B")!.problem).toBeNull();
    expect(r.find((x) => x.key === "Ladies")!.problem).toBe("Ladies: 5 rounds created but the Tournament Structure needs 3; remove 2 or change the Structure.");
  });
  it("lists every missing round and ignores non-Swiss categories", () => {
    const r = roundCountCheck(answers, units, [st("Mens::B")]);
    expect(r.find((x) => x.key === "Mens::B")!.problem).toBe("Mens › B: 1 of 4 rounds created; add Round 2, Round 3, Round 4.");
    expect(r.some((x) => x.key === "Plate")).toBe(false);
  });
});
