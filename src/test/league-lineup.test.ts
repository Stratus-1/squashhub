import { describe, it, expect } from "vitest";
import {
  applyPrefillSlot,
  lineupDiffers,
  resolveLineupPositions,
  rowHasPlay,
  rowHasSavedPlayers,
  shouldKeepSavedRow,
} from "@/lib/league/lineup";

const slot = (code: string, name: string) => ({ code, name });

describe("saved lineup rows are authoritative", () => {
  it("keeps a saved reserve even when the fixture result row is missing", () => {
    const row = { position: 3, home_player_code: "NSA999", home_player_name: "Reserve Ruan" };
    expect(rowHasPlay(row)).toBe(false);
    expect(rowHasSavedPlayers(row)).toBe(true);
    // hasSavedFixtureState = false → previously this row was blanked (the bug)
    expect(shouldKeepSavedRow(row, false)).toBe(true);
  });

  it("blanks a genuinely empty row", () => {
    expect(shouldKeepSavedRow({ position: 1 }, false)).toBe(false);
  });

  it("keeps rows with recorded play", () => {
    expect(shouldKeepSavedRow({ position: 1, game_scores: [{ h: 11, a: 5 }] }, false)).toBe(true);
    expect(shouldKeepSavedRow({ position: 2, is_forfeit: true }, false)).toBe(true);
  });
});

describe("lineup precedence", () => {
  const week = [
    { position: 1, memberId: "a" },
    { position: 2, memberId: "b" },
    { position: 3, memberId: "c" },
    { position: 4, memberId: "d" },
  ];

  it("per-fixture override beats the weekly default", () => {
    const { lineup, originals } = resolveLineupPositions({
      fixtureOverrides: [{ position: 3, memberId: "reserve" }],
      weekLineup: week,
      registrations: ["a", "b", "c", "d", "e"],
      maxPositions: 8,
      fallbackCount: 4,
    });
    expect(lineup.slice(0, 4)).toEqual(["a", "b", "reserve", "d"]);
    // originals still describe the default team (for original-player bonuses)
    expect(originals.slice(0, 4)).toEqual(["a", "b", "c", "d"]);
  });

  it("supports multiple reserve positions without duplicating players", () => {
    const { lineup } = resolveLineupPositions({
      fixtureOverrides: [
        { position: 2, memberId: "r1" },
        { position: 4, memberId: "r2" },
      ],
      weekLineup: week,
      registrations: ["a", "b", "c", "d"],
      maxPositions: 8,
      fallbackCount: 4,
    });
    expect(lineup.slice(0, 4)).toEqual(["a", "r1", "c", "r2"]);
    expect(new Set(lineup.filter(Boolean)).size).toBe(4);
  });

  it("falls back to registration order for empty slots only", () => {
    const { lineup } = resolveLineupPositions({
      fixtureOverrides: [],
      weekLineup: [{ position: 1, memberId: "a" }],
      registrations: ["a", "b", "c"],
      maxPositions: 8,
      fallbackCount: 3,
    });
    expect(lineup.slice(0, 3)).toEqual(["a", "b", "c"]);
  });
});

describe("prefill never overwrites a saved player", () => {
  it("leaves a reserve in place", () => {
    const out = applyPrefillSlot(slot("", "Reserve Ruan"), slot("NSA111", "Original Owen"), {
      slotHasPlay: false,
      sourceHasAny: true,
    });
    expect(out).toEqual(slot("", "Reserve Ruan"));
  });

  it("fills an empty slot from the default lineup", () => {
    const out = applyPrefillSlot(slot("", ""), slot("NSA111", "Original Owen"), {
      slotHasPlay: false,
      sourceHasAny: true,
    });
    expect(out).toEqual(slot("NSA111", "Original Owen"));
  });

  it("never touches a slot with recorded play", () => {
    const out = applyPrefillSlot(slot("NSA222", "Played Pete"), slot("NSA111", "Original Owen"), {
      slotHasPlay: true,
      sourceHasAny: true,
    });
    expect(out).toEqual(slot("NSA222", "Played Pete"));
  });
});

describe("full reserve round-trip: save → reopen → start match", () => {
  it("reserve survives reload with no fixture result row and a default week lineup", () => {
    // 1. Captain swaps a reserve into position 3 and it is persisted.
    const savedRows = [
      { position: 1, home_player_code: "H1", home_player_name: "Home One" },
      { position: 2, home_player_code: "H2", home_player_name: "Home Two" },
      { position: 3, home_player_code: "", home_player_name: "Reserve Ruan" },
      { position: 4, home_player_code: "H4", home_player_name: "Home Four" },
    ];

    // 2. Page reopens later: fixture result row not yet created/fetched.
    const loaded = savedRows.map((r) =>
      shouldKeepSavedRow(r, false)
        ? { code: r.home_player_code || "", name: r.home_player_name || "" }
        : slot("", ""),
    );
    expect(loaded[2]).toEqual(slot("", "Reserve Ruan"));

    // 3. Default (week) prefill arrives and tries to restore the original.
    const prefill = [slot("H1", "Home One"), slot("H2", "Home Two"), slot("H3", "Original Three"), slot("H4", "Home Four")];
    const merged = loaded.map((cur, i) =>
      applyPrefillSlot(cur, prefill[i], { slotHasPlay: false, sourceHasAny: true }),
    );

    // 4. Match starts — reserve is still there.
    expect(merged[2]).toEqual(slot("", "Reserve Ruan"));
    expect(merged.map((m) => m.name)).toEqual(["Home One", "Home Two", "Reserve Ruan", "Home Four"]);
  });
});

describe("stale-write detection", () => {
  const local = [
    { homeCode: "H1", homeName: "Home One", awayCode: "A1", awayName: "Away One" },
  ];
  it("detects a server-side change", () => {
    expect(
      lineupDiffers(local, [
        { position: 1, home_player_code: "HX", home_player_name: "Someone Else", away_player_code: "A1", away_player_name: "Away One" },
      ]),
    ).toBe(true);
  });
  it("reports no change when identical", () => {
    expect(
      lineupDiffers(local, [
        { position: 1, home_player_code: "h1", home_player_name: "Home One", away_player_code: "A1", away_player_name: "Away One" },
      ]),
    ).toBe(false);
  });
});
