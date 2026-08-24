/**
 * Manual draw control for EVERY knockout round after the first.
 *
 * These tests lock the safety rules: only legitimate qualifiers may be drawn,
 * completed rounds are immutable, and a generated-but-unplayed round can be
 * redrawn only while it carries no results and no court bookings.
 */
import { describe, it, expect } from "vitest";
import {
  prepareActionLabel,
  prepareDrawTitle,
  qualifierIds,
  qualifierEntrants,
  illegalEntrants,
  hasResult,
  roundRedrawState,
} from "@/lib/tournaments/round-draw";
import { suggestNextRoundBoard, validateDrawBoard, drawToMatchRows, moveEntrant } from "@/lib/tournaments/draw-board";

const done = (over: any = {}) => ({
  id: over.id || Math.random().toString(36).slice(2),
  status: "completed",
  round_number: 1,
  section_number: 1,
  group_number: 1,
  ...over,
});

const r1 = [
  done({ id: "m1", bracket_position: 1, player_a_member_id: "A", player_b_member_id: "B", winner_member_id: "A" }),
  done({ id: "m2", bracket_position: 2, player_a_member_id: "C", player_b_member_id: "D", winner_member_id: "D" }),
  done({ id: "m3", bracket_position: 3, player_a_member_id: "E", player_b_member_id: "F", winner_member_id: "E" }),
  done({ id: "m4", bracket_position: 4, player_a_member_id: "G", player_b_member_id: null, is_bye: true, bye_member_id: "G", status: "bye" }),
];

const section = (matches: any[], extra: any = {}) =>
  ({ currentRoundComplete: true, currentRoundMatches: matches, ...extra }) as any;

describe("contextual labels", () => {
  it("names the stage, never a hard-coded round", () => {
    expect(prepareActionLabel("Semi-final", 3)).toMatch(/Prepare Semi/i);
    expect(prepareActionLabel("Final", 4)).toBe("Prepare Final");
    expect(prepareActionLabel(null, 2)).toBe("Prepare Round 2");
    expect(prepareDrawTitle("Final", 4)).toContain("Final");
  });
});

describe("qualifiers only", () => {
  it("populates the next board with winners (byes advance)", () => {
    expect(qualifierIds(r1 as any)).toEqual(["A", "D", "E", "G"]);
  });

  it("gives no entrants while the feeder round is unfinished", () => {
    expect(qualifierEntrants(section(r1, { currentRoundComplete: false }), (i) => i)).toEqual([]);
  });

  it("rejects an eliminated player injected into the board", () => {
    const winners = qualifierEntrants(section(r1), (i) => i);
    const board = suggestNextRoundBoard({ groupNumber: 1, section: 1, round: 2, winners });
    expect(validateDrawBoard(board, winners).ok).toBe(true);
    // B lost round 1 — putting them in the board is not a legal draw.
    const tampered = { ...board, matches: board.matches.map((m, i) => (i === 0 ? { ...m, b: "B" } : m)) };
    expect(validateDrawBoard(tampered, winners).ok).toBe(false);
    expect(illegalEntrants(["A", "B"], qualifierIds(r1 as any))).toEqual(["B"]);
  });

  it("refuses a duplicate entrant and a self match", () => {
    const winners = qualifierEntrants(section(r1), (i) => i);
    const board = suggestNextRoundBoard({ groupNumber: 1, section: 1, round: 2, winners });
    const dup = { ...board, matches: board.matches.map((m) => ({ ...m, a: "A" })) };
    expect(validateDrawBoard(dup, winners).ok).toBe(false);
    const self = { ...board, matches: [{ ...board.matches[0], a: "A", b: "A" }] };
    expect(validateDrawBoard(self, winners).ok).toBe(false);
  });
});

describe("manual rearrangement creates exactly those pairings", () => {
  it("confirms the dragged pairings, not the suggested ones", () => {
    const winners = qualifierEntrants(section(r1), (i) => i);
    const board = suggestNextRoundBoard({ groupNumber: 1, section: 1, round: 2, winners });
    expect(board.matches.map((m) => [m.a, m.b])).toEqual([
      ["A", "D"],
      ["E", "G"],
    ]);
    // Admin wants A v G and E v D.
    const moved = moveEntrant(board, "G", { section: 1, round: 2, position: 1, side: "b" });
    const rows = drawToMatchRows({ champId: "t1", board: moved, entrants: winners });
    const pairs = rows.map((r: any) => [r.player_a_member_id, r.player_b_member_id]);
    expect(pairs).toContainEqual(["A", "G"]);
    expect(pairs).toContainEqual(["E", "D"]);
    expect(rows.every((r: any) => r.round_number === 2)).toBe(true);
  });

  it("emptying a slot produces a bye that advances, not a self match", () => {
    const winners = qualifierEntrants(section(r1), (i) => i);
    let board = suggestNextRoundBoard({ groupNumber: 1, section: 1, round: 2, winners });
    board = { ...board, matches: [{ ...board.matches[0], b: null }, board.matches[1]] };
    const rows = drawToMatchRows({ champId: "t1", board, entrants: winners });
    const bye: any = rows.find((r: any) => r.is_bye);
    expect(bye).toBeTruthy();
    expect(bye.player_b_member_id).toBeNull();
    expect(bye.winner_member_id ?? bye.bye_member_id).toBe("A");
  });
});

describe("redraw safety", () => {
  const unplayed = [
    { id: "n1", round_number: 2, status: "scheduled", player_a_member_id: "A", player_b_member_id: "D" },
    { id: "n2", round_number: 2, status: "scheduled", player_a_member_id: "E", player_b_member_id: "G" },
  ];

  it("allows a redraw of an entirely unplayed round", () => {
    const st = roundRedrawState(unplayed as any);
    expect(st.canRedraw).toBe(true);
    expect(st.replaceIds).toEqual(["n1", "n2"]);
    expect(st.warning).toBeNull();
  });

  it("refuses once any result exists", () => {
    const st = roundRedrawState([{ ...unplayed[0], status: "completed", winner_member_id: "A" }, unplayed[1]] as any);
    expect(st.canRedraw).toBe(false);
    expect(st.reason).toMatch(/already been played/i);
    expect(hasResult({ status: "completed", winner_member_id: "A" } as any)).toBe(true);
  });

  it("refuses while a fixture holds a court booking", () => {
    const st = roundRedrawState([{ ...unplayed[0], booking_id: "b1" }, unplayed[1]] as any);
    expect(st.canRedraw).toBe(false);
    expect(st.reason).toMatch(/court-booked/i);
    expect(st.bookedIds).toEqual(["n1"]);
  });

  it("warns (but allows) when fixtures merely have dates", () => {
    const st = roundRedrawState([{ ...unplayed[0], scheduled_date: "2026-09-01" }, unplayed[1]] as any);
    expect(st.canRedraw).toBe(true);
    expect(st.warning).toMatch(/set them again/i);
  });

  it("never treats a completed round as redrawable", () => {
    expect(roundRedrawState(r1 as any).canRedraw).toBe(false);
    expect(roundRedrawState([] as any).canRedraw).toBe(false);
  });

  it("counts a bye as unplayed so a bye-only round stays redrawable", () => {
    expect(hasResult({ is_bye: true, status: "bye", winner_member_id: "G" } as any)).toBe(false);
  });
});

describe("round after round", () => {
  it("semifinal winners feed the final", () => {
    const sf = [
      done({ id: "s1", round_number: 2, bracket_position: 1, player_a_member_id: "A", player_b_member_id: "G", winner_member_id: "G" }),
      done({ id: "s2", round_number: 2, bracket_position: 2, player_a_member_id: "E", player_b_member_id: "D", winner_member_id: "E" }),
    ];
    const winners = qualifierEntrants(section(sf), (i) => i);
    expect(winners.map((w) => w.id)).toEqual(["G", "E"]);
    const board = suggestNextRoundBoard({ groupNumber: 1, section: 1, round: 3, winners });
    expect(validateDrawBoard(board, winners).ok).toBe(true);
    const rows = drawToMatchRows({ champId: "t1", board, entrants: winners });
    expect(rows).toHaveLength(1);
    expect((rows[0] as any).round_number).toBe(3);
  });
});
