import { describe, expect, it } from "vitest";
import {
  boardProgress,
  defaultPlayBy,
  drawLayout,
  LARGE_ROUND_THRESHOLD,
  matchesInScope,
  readyNextRoundScopes,
  remainingNextRoundScopes,
  nextOutstandingScope,
  outstandingDrawsHeadline,
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
    expect(stageNameForQualifiers(16, 2)).toBe("Round of 16");
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

describe("multi-division next-round scope inventory", () => {
  const completedSection = (groupNumber: number, section: number, qualifiers: number) =>
    Array.from({ length: qualifiers }, (_, i) => ({
      id: `r1-${groupNumber}-${section}-${i}`,
      stage: "ko",
      group_number: groupNumber,
      section_number: section,
      round_number: 1,
      bracket_position: i + 1,
      status: "completed",
      player_a_member_id: `g${groupNumber}s${section}w${i}`,
      player_b_member_id: `g${groupNumber}s${section}l${i}`,
      winner_member_id: `g${groupNumber}s${section}w${i}`,
    }));

  it("exposes every ready division/pool with exact unique qualifier and matchup counts", async () => {
    const { sectionProgression } = await import("@/lib/tournaments/knockout-progression");
    const r1 = [
      ...completedSection(1, 1, 34),
      ...completedSection(1, 2, 5),
      ...completedSection(2, 1, 4),
      ...completedSection(2, 2, 3),
    ];
    const scopes = readyNextRoundScopes(sectionProgression(r1 as any));

    expect(scopes.map((scope) => scope.key)).toEqual(["1-1", "1-2", "2-1", "2-2"]);
    expect(scopes.map((scope) => [scope.qualifiers, scope.matchups])).toEqual([
      [34, 17], [5, 3], [4, 2], [3, 2],
    ]);
    expect(scopes.map((scope) => scope.stageLabel)).toEqual([
      "Round of 64", "Quarter-final", "Semi-final", "Semi-final",
    ]);
    expect(new Set(scopes.flatMap((scope) => scope.qualifierIds)).size).toBe(46);
    expect(drawLayout(scopes[0].matchups)).toBe("list");
    expect(r1.every((match) => match.round_number === 1 && match.status === "completed")).toBe(true);
  });

  it("de-duplicates a repeated winner instead of silently creating two slots", async () => {
    const { sectionProgression } = await import("@/lib/tournaments/knockout-progression");
    const rows = completedSection(1, 1, 4);
    rows[1].winner_member_id = rows[0].winner_member_id;
    const [scope] = readyNextRoundScopes(sectionProgression(rows as any));
    expect(scope.qualifiers).toBe(3);
    expect(new Set(scope.qualifierIds).size).toBe(scope.qualifiers);
  });
});

describe("guided draw queue", () => {
  const scopes = [
    { key: "1-1", groupNumber: 1, section: 1, roundNumber: 2, qualifierIds: [], qualifiers: 8, matchups: 4, stageLabel: "Quarter-final" },
    { key: "1-2", groupNumber: 1, section: 2, roundNumber: 2, qualifierIds: [], qualifiers: 8, matchups: 4, stageLabel: "Quarter-final" },
    { key: "2-1", groupNumber: 2, section: 1, roundNumber: 2, qualifierIds: [], qualifiers: 4, matchups: 2, stageLabel: "Semi-final" },
  ];

  it("walks the ready scopes one after the other", () => {
    expect(nextOutstandingScope(scopes)!.key).toBe("1-1");
    expect(nextOutstandingScope(scopes, ["1-1"])!.key).toBe("1-2");
    expect(nextOutstandingScope(scopes, ["1-1", "1-2"])!.key).toBe("2-1");
    expect(nextOutstandingScope(scopes, ["1-1", "1-2", "2-1"])).toBeNull();
  });

  it("never re-offers a draw confirmed in this session", () => {
    const left = remainingNextRoundScopes(scopes, ["1-2"]);
    expect(left.map((s) => s.key)).toEqual(["1-1", "2-1"]);
    expect(remainingNextRoundScopes(scopes, ["1-1", "1-1"]).length).toBe(2);
  });

  it("states the outstanding count in plain English", () => {
    expect(outstandingDrawsHeadline(3)).toBe("3 draws still need preparation.");
    expect(outstandingDrawsHeadline(1)).toBe("1 draw still needs preparation.");
    expect(outstandingDrawsHeadline(0)).toBeNull();
  });
});

describe("allDrawsFitOnePage", () => {
  const scope = (qualifiers: number) => ({ qualifiers, matchups: Math.ceil(qualifiers / 2) });

  it("fits a small set of ready draws on one page", () => {
    const fit = allDrawsFitOnePage([scope(4), scope(4), scope(6)]);
    expect(fit.fits).toBe(true);
    expect(fit.totalMatchups).toBe(7);
    expect(fit.reason).toBeNull();
  });

  it("falls back to step by step when there are too many matchups", () => {
    const fit = allDrawsFitOnePage([scope(20), scope(20)]);
    expect(fit.fits).toBe(false);
    expect(fit.reason).toMatch(/too many/);
  });

  it("falls back to step by step when there are too many separate draws", () => {
    const fit = allDrawsFitOnePage(Array.from({ length: 8 }, () => scope(2)));
    expect(fit.fits).toBe(false);
  });

  it("never fits an empty queue", () => {
    expect(allDrawsFitOnePage([]).fits).toBe(false);
  });
});
