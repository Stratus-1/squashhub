import { describe, it, expect } from "vitest";
import {
  aggregateRubbers,
  applyParticipantSnapshot,
  formatQuestions,
  pairDisplayName,
  pairsForRound,
  resolveFormat,
  rubberSlots,
  totalRubbers,
  validateSelection,
  type TeamPair,
} from "@/lib/leagues/format";

const pairs: TeamPair[] = [
  { id: "p1", player_one_member_id: "a", player_two_member_id: "b", pair_order: 1 },
  { id: "p2", player_one_member_id: "c", player_two_member_id: "d", pair_order: 2 },
  { id: "p3", player_one_member_id: "e", player_two_member_id: "f", pair_order: 3 },
];

describe("1) Singles legacy behaviour unchanged", () => {
  it("defaults to team_size singles rubbers and no doubles", () => {
    const cfg = resolveFormat({ discipline: "singles", category: "mens" }, { team_size: 5 });
    expect(cfg.singlesRubbers).toBe(5);
    expect(cfg.doublesRubbers).toBe(0);
    expect(totalRubbers(cfg)).toBe(5);
    expect(rubberSlots(cfg).every((s) => s.type === "singles")).toBe(true);
  });

  it("legacy rows with no discipline resolve to singles", () => {
    const cfg = resolveFormat({}, null);
    expect(cfg.discipline).toBe("singles");
    expect(cfg.doublesRubbers).toBe(0);
  });

  it("asks no doubles questions for singles", () => {
    const q = formatQuestions("singles");
    expect(q.askDoublesRubbers).toBe(false);
    expect(q.askPairs).toBe(false);
  });
});

describe("2) Doubles with fixed pairs", () => {
  const cfg = resolveFormat(
    { discipline: "doubles", category: "mens" },
    { doubles_rubbers: 2, pairing_policy: "fixed" },
  );

  it("composes only doubles rubbers", () => {
    expect(cfg.singlesRubbers).toBe(0);
    expect(rubberSlots(cfg).map((s) => s.label)).toEqual(["Doubles 1", "Doubles 2"]);
  });

  it("uses the same pairs every round", () => {
    expect(pairsForRound(pairs, cfg, 1).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(pairsForRound(pairs, cfg, 7).map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});

describe("3) Rotating pairs and historical immutability", () => {
  const cfg = resolveFormat(
    { discipline: "doubles" },
    { doubles_rubbers: 2, pairing_policy: "per_fixture" },
  );

  it("rotates the pool by round", () => {
    expect(pairsForRound(pairs, cfg, 1).map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(pairsForRound(pairs, cfg, 2).map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(pairsForRound(pairs, cfg, 3).map((p) => p.id)).toEqual(["p3", "p1"]);
  });

  it("never rewrites recorded participants once locked", () => {
    const existing = {
      home_player_member_id: "a",
      home_player2_member_id: "b",
      home_player_name: "Ann",
      home_player2_name: "Ben",
      participants_locked_at: "2026-05-01T00:00:00Z",
    };
    const merged = applyParticipantSnapshot(existing, {
      home_player_member_id: "z",
      home_player2_member_id: "y",
      home_player_name: "Zed",
      home_player2_name: "Yan",
    } as any);
    expect(merged.home_player_member_id).toBe("a");
    expect(merged.home_player_name).toBe("Ann");
    expect(merged.participants_locked_at).toBe("2026-05-01T00:00:00Z");
  });

  it("accepts participants on a rubber that is not yet locked", () => {
    const merged = applyParticipantSnapshot(null, {
      home_player_member_id: "z",
      home_player2_member_id: "y",
    } as any);
    expect(merged.home_player_member_id).toBe("z");
  });
});

describe("4) Hybrid configurable composition", () => {
  it("is not hard-coded to 3 singles + 1 doubles", () => {
    const cfg = resolveFormat(
      { discipline: "hybrid" },
      { singles_rubbers: 4, doubles_rubbers: 2 },
    );
    expect(cfg.singlesRubbers).toBe(4);
    expect(cfg.doublesRubbers).toBe(2);
    expect(rubberSlots(cfg).map((s) => s.type)).toEqual([
      "singles",
      "singles",
      "singles",
      "singles",
      "doubles",
      "doubles",
    ]);
  });

  it("blocks dual participation unless the rules allow it", () => {
    const strict = resolveFormat({ discipline: "hybrid" }, { singles_rubbers: 1, doubles_rubbers: 1 });
    const entries = [
      { position: 1, type: "singles" as const, memberIds: ["a"] },
      { position: 2, type: "doubles" as const, memberIds: ["a", "b"] },
    ];
    expect(validateSelection({ cfg: strict, entries }).length).toBe(1);

    const lenient = resolveFormat(
      { discipline: "hybrid" },
      { singles_rubbers: 1, doubles_rubbers: 1, allow_dual_participation: true },
    );
    expect(validateSelection({ cfg: lenient, entries })).toEqual([]);
  });
});

describe("5) Mixed rule validation and Open freedom", () => {
  const genders = { a: "male", b: "male", c: "female" };

  it("rejects a same-gender pair only when mixed composition is required", () => {
    const required = resolveFormat(
      { discipline: "doubles", category: "mixed" },
      { doubles_rubbers: 1, require_mixed_pair: true },
    );
    const entries = [{ position: 1, type: "doubles" as const, memberIds: ["a", "b"] }];
    expect(validateSelection({ cfg: required, entries, gendersByMember: genders }).length).toBe(1);
    expect(
      validateSelection({
        cfg: required,
        entries: [{ position: 1, type: "doubles", memberIds: ["a", "c"] }],
        gendersByMember: genders,
      }),
    ).toEqual([]);

    const optional = resolveFormat(
      { discipline: "doubles", category: "mixed" },
      { doubles_rubbers: 1, require_mixed_pair: false },
    );
    expect(validateSelection({ cfg: optional, entries, gendersByMember: genders })).toEqual([]);
  });

  it("Open accepts any combination of genders", () => {
    const open = resolveFormat({ discipline: "doubles", category: "open" }, { doubles_rubbers: 1 });
    for (const ids of [["a", "b"], ["a", "c"], ["c", "a"]]) {
      expect(
        validateSelection({
          cfg: open,
          entries: [{ position: 1, type: "doubles", memberIds: ids }],
          gendersByMember: genders,
        }),
      ).toEqual([]);
    }
  });

  it("a doubles rubber still needs two distinct real players", () => {
    const cfg = resolveFormat({ discipline: "doubles", category: "open" }, { doubles_rubbers: 1 });
    expect(
      validateSelection({ cfg, entries: [{ position: 1, type: "doubles", memberIds: ["a"] }] }).length,
    ).toBe(1);
    expect(
      validateSelection({
        cfg,
        entries: [{ position: 1, type: "doubles", memberIds: ["a", "a"] }],
      }).length,
    ).toBe(1);
  });
});

describe("6) Rubbers aggregate to fixture totals", () => {
  it("singles-only totals match the legacy shape", () => {
    const totals = aggregateRubbers([
      { position: 1, rubber_type: "singles", home_games_won: 3, away_games_won: 1, winner: "home" },
      { position: 2, rubber_type: "singles", home_games_won: 0, away_games_won: 3, winner: "away" },
    ]);
    expect(totals).toMatchObject({
      rubbers: 2,
      singles: 2,
      doubles: 0,
      homeRubbersWon: 1,
      awayRubbersWon: 1,
      homeGames: 3,
      awayGames: 4,
    });
  });

  it("mixed singles + doubles rubbers aggregate together", () => {
    const totals = aggregateRubbers([
      { position: 1, rubber_type: "singles", home_games_won: 3, away_games_won: 2, winner: "home" },
      { position: 2, rubber_type: "doubles", home_games_won: 3, away_games_won: 0, winner: "home" },
      { position: 3, rubber_type: "doubles", home_games_won: 1, away_games_won: 3, winner: "away" },
    ]);
    expect(totals.rubbers).toBe(3);
    expect(totals.singles).toBe(1);
    expect(totals.doubles).toBe(2);
    expect(totals.homeRubbersWon).toBe(2);
    expect(totals.awayRubbersWon).toBe(1);
    expect(totals.homeGames).toBe(7);
    expect(totals.awayGames).toBe(5);
  });

  it("legacy rows without rubber_type count as singles", () => {
    expect(aggregateRubbers([{ position: 1, home_games_won: 3, away_games_won: 0 }]).singles).toBe(1);
  });
});

describe("pair display", () => {
  it("joins both names and falls back safely", () => {
    expect(pairDisplayName("Ann", "Ben")).toBe("Ann & Ben");
    expect(pairDisplayName("Ann", null)).toBe("Ann");
    expect(pairDisplayName(null, null)).toBe("TBC");
  });
});
