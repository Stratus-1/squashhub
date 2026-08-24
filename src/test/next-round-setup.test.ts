import { describe, expect, it } from "vitest";
import {
  boardProgress,
  defaultPlayBy,
  drawLayout,
  LARGE_ROUND_THRESHOLD,
  matchesInScope,
  sectionsOf,
  stageNameForQualifiers,
  stageNameOptions,
  suggestStageName,
  validateNextRoundSetup,
} from "@/lib/tournaments/next-round-setup";

const board = (matches: { section: number; position: number; a?: string | null; b?: string | null }[]) => ({
  groupNumber: 1,
  round: 2,
  matches: matches.map((m) => ({ section: m.section, round: 2, position: m.position, a: m.a ?? null, b: m.b ?? null })),
});

describe("contextual stage suggestion", () => {
  it("names the stage from the qualifier count", () => {
    expect(stageNameForQualifiers(2, 4)).toBe("Final");
    expect(stageNameForQualifiers(4, 3)).toBe("Semi-final");
    expect(stageNameForQualifiers(8, 2)).toBe("Quarter-final");
    expect(stageNameForQualifiers(16, 2)).toBe("Round 2");
  });

  it("prefers the label the organiser already configured", () => {
    expect(suggestStageName({ plannedLabel: "Plate final", roundNumber: 3, qualifiers: 2 })).toBe("Plate final");
    expect(suggestStageName({ plannedLabel: "  ", roundNumber: 2, qualifiers: 8 })).toBe("Quarter-final");
  });

  it("offers alternatives without duplicates", () => {
    const opts = stageNameOptions(4, 3);
    expect(opts[0]).toBe("Semi-final");
    expect(new Set(opts).size).toBe(opts.length);
  });
});

describe("next round setup validation", () => {
  it("requires a name", () => {
    expect(validateNextRoundSetup({ label: "", playBy: null })).toContain("Give this round a name.");
  });

  it("requires a play-by date when players arrange their own matches", () => {
    expect(validateNextRoundSetup({ label: "Semi-final", playBy: null }, { requirePlayBy: true })).toHaveLength(1);
    expect(validateNextRoundSetup({ label: "Semi-final", playBy: "2030-01-01" }, { requirePlayBy: true })).toEqual([]);
  });

  it("rejects a past play-by date", () => {
    expect(
      validateNextRoundSetup({ label: "Final", playBy: "2020-01-01" }, { today: "2026-01-01" }),
    ).toContain("Play-by date is in the past.");
  });

  it("suggests a future default", () => {
    expect(defaultPlayBy(new Date("2026-01-01T00:00:00Z"), 7)).toBe("2026-01-08");
  });
});

describe("adaptive draw layout", () => {
  it("keeps the bracket for small rounds", () => {
    expect(drawLayout(1)).toBe("bracket");
    expect(drawLayout(8)).toBe("bracket");
    expect(drawLayout(LARGE_ROUND_THRESHOLD)).toBe("bracket");
  });

  it("switches to the compact list for large rounds", () => {
    expect(drawLayout(LARGE_ROUND_THRESHOLD + 1)).toBe("list");
    expect(drawLayout(50)).toBe("list");
  });

  it("reports progress for the round", () => {
    const p = boardProgress(board([
      { section: 1, position: 1, a: "x", b: "y" },
      { section: 1, position: 2, a: "z" },
      { section: 1, position: 3 },
    ]));
    expect(p.matches).toBe(3);
    expect(p.complete).toBe(1);
    expect(p.byes).toBe(1);
    expect(p.empty).toBe(1);
    expect(p.incomplete).toBe(2);
    expect(p.summary).toBe("3 matches in this round · 2 incomplete");
  });
});

describe("scoped editing", () => {
  const b = board([
    { section: 2, position: 1, a: "c", b: "d" },
    { section: 1, position: 2, a: "e", b: "f" },
    { section: 1, position: 1, a: "a", b: "b" },
  ]);

  it("lists sections ascending", () => {
    expect(sectionsOf(b)).toEqual([1, 2]);
  });

  it("returns only the matches of the selected scope, ordered", () => {
    expect(matchesInScope(b, 1).map((m) => m.position)).toEqual([1, 2]);
    expect(matchesInScope(b, 2).map((m) => m.a)).toEqual(["c"]);
    expect(matchesInScope(b, "all")).toHaveLength(3);
  });

  it("never leaks another section into the working slice", () => {
    expect(matchesInScope(b, 1).every((m) => m.section === 1)).toBe(true);
  });
});
