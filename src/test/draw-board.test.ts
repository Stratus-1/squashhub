import { describe, expect, it } from "vitest";
import {
  benchedEntrants,
  clearSlot,
  drawAuditSnapshot,
  drawOverrides,
  drawToMatchRows,
  findSlot,
  immutableMatchIds,
  moveEntrant,
  roundIsEditable,
  suggestFromEntrants,
  suggestNextRoundBoard,
  validateDrawBoard,
  winnersAsEntrants,
  type DrawEntrant,
} from "@/lib/tournaments/draw-board";

const entrants = (n: number): DrawEntrant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}`, name: `Player ${i + 1}`, seed: i + 1 }));

describe("suggested draw", () => {
  it("proposes a standard seeded bracket", () => {
    const board = suggestFromEntrants(1, entrants(8));
    expect(board.matches).toHaveLength(4);
    expect(board.matches[0]).toMatchObject({ a: "m1", b: "m8" });
    expect(board.matches.every((m) => m.a && m.b)).toBe(true);
  });

  it("gives the opening bye to the top seeds when the field is uneven", () => {
    const board = suggestFromEntrants(1, entrants(5));
    const byeSlots = board.matches.filter((m) => !m.a || !m.b);
    expect(byeSlots.length).toBe(3);
    expect(validateDrawBoard(board, entrants(5)).ok).toBe(true);
  });
});

describe("manual overrides", () => {
  it("swaps entrants instead of overwriting them", () => {
    const list = entrants(8);
    const board = suggestFromEntrants(1, list);
    const target = findSlot(board, "m8")!;
    const next = moveEntrant(board, "m2", target);
    expect(findSlot(next, "m2")).toEqual(target);
    // m8 took m2's old spot — nobody vanished.
    expect(findSlot(next, "m8")).toEqual(findSlot(board, "m2"));
    expect(benchedEntrants(next, list)).toEqual([]);
    expect(validateDrawBoard(next, list).ok).toBe(true);
  });

  it("allows a deliberate empty slot / bye", () => {
    const list = entrants(8);
    let board = suggestFromEntrants(1, list);
    const slot = findSlot(board, "m8")!;
    board = clearSlot(board, slot);
    const v = validateDrawBoard(board, list);
    // m8 is now unplaced — the board tells the admin instead of dropping them.
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("not placed");
    // Put m8 in a free slot vacated elsewhere → a clean bye for m1.
    const m1 = findSlot(board, "m1")!;
    board = moveEntrant(board, "m8", m1);
    const v2 = validateDrawBoard(board, list.filter((e) => e.id !== "m1"));
    expect(v2.ok).toBe(true);
    expect(v2.byes).toBe(1);
  });

  it("rejects a duplicate entrant", () => {
    const list = entrants(4);
    const board = suggestFromEntrants(1, list);
    board.matches[1].a = "m1";
    const v = validateDrawBoard(board, list);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("appears 2 times");
  });

  it("rejects a player from another division", () => {
    const list = entrants(4);
    const board = suggestFromEntrants(1, list);
    board.matches[1].b = "outsider";
    const v = validateDrawBoard(board, list);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("not entered in this division");
  });

  it("warns but never blocks an unconventional pairing", () => {
    const list = entrants(8);
    let board = suggestFromEntrants(1, list);
    board = moveEntrant(board, "m2", findSlot(board, "m8")!);
    const v = validateDrawBoard(board, list);
    expect(v.ok).toBe(true);
  });

  it("resets cleanly to the suggested draw", () => {
    const list = entrants(8);
    const suggested = suggestFromEntrants(1, list);
    const edited = moveEntrant(suggested, "m2", findSlot(suggested, "m8")!);
    expect(drawOverrides(suggested, edited, list).length).toBeGreaterThan(0);
    const reset = suggestFromEntrants(1, list);
    expect(drawOverrides(suggested, reset, list)).toEqual([]);
  });
});

describe("confirm draw", () => {
  it("generates exactly the visible matchups", () => {
    const list = entrants(8);
    let board = suggestFromEntrants(1, list);
    board = moveEntrant(board, "m2", findSlot(board, "m8")!);
    const rows = drawToMatchRows({ champId: "c1", board, entrants: list });
    expect(rows).toHaveLength(4);
    const pairs = rows.map((r) => [r.player_a_member_id, r.player_b_member_id]);
    expect(pairs).toEqual(board.matches.map((m) => [m.a, m.b]));
    expect(rows.every((r) => r.stage === "ko" && r.round_number === 1)).toBe(true);
  });

  it("writes a bye as a one-sided, already-won row", () => {
    const list = entrants(5);
    const board = suggestFromEntrants(1, list);
    const rows = drawToMatchRows({ champId: "c1", board, entrants: list });
    const byes = rows.filter((r) => r.is_bye);
    expect(byes.length).toBeGreaterThan(0);
    for (const b of byes) {
      expect(b.status).toBe("completed");
      expect(b.winner_member_id).toBe(b.bye_member_id);
    }
  });

  it("records the manual overrides in the audit snapshot", () => {
    const list = entrants(8);
    const suggested = suggestFromEntrants(1, list);
    const board = moveEntrant(suggested, "m2", findSlot(suggested, "m8")!);
    const snap = drawAuditSnapshot({ board, suggested, entrants: list, divisionLabel: "A League" });
    expect(snap.kind).toBe("visual_draw");
    expect(snap.division_label).toBe("A League");
    expect(snap.manual_overrides.map((o) => o.name).sort()).toEqual(["Player 2", "Player 8"]);
    expect(snap.matchups).toHaveLength(4);
  });
});

describe("later rounds", () => {
  const played = [
    { id: "x1", bracket_position: 1, status: "completed", winner_member_id: "m1", player_a_member_id: "m1", player_b_member_id: "m8" },
    { id: "x2", bracket_position: 2, status: "completed", winner_member_id: "m4", player_a_member_id: "m4", player_b_member_id: "m5" },
    { id: "x3", bracket_position: 3, status: "completed", winner_member_id: "m3", player_a_member_id: "m3", player_b_member_id: "m6" },
    { id: "x4", bracket_position: 4, status: "completed", winner_member_id: "m2", player_a_member_id: "m2", player_b_member_id: "m7" },
  ] as any[];

  it("carries only the winners into the next draw", () => {
    const winners = winnersAsEntrants(played, (id) => id.toUpperCase());
    expect(winners.map((w) => w.id)).toEqual(["m1", "m4", "m3", "m2"]);
    const board = suggestNextRoundBoard({ groupNumber: 1, section: 1, round: 2, winners });
    expect(board.matches).toEqual([
      { section: 1, round: 2, position: 1, a: "m1", b: "m4" },
      { section: 1, round: 2, position: 2, a: "m3", b: "m2" },
    ]);
    expect(validateDrawBoard(board, winners).ok).toBe(true);
  });

  it("refuses a losing player being drawn into the next round", () => {
    const winners = winnersAsEntrants(played, (id) => id);
    const board = suggestNextRoundBoard({ groupNumber: 1, section: 1, round: 2, winners });
    board.matches[0].b = "m8"; // eliminated
    const v = validateDrawBoard(board, winners);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("not entered in this division");
  });

  it("treats completed fixtures as immutable and blocks re-drawing them", () => {
    expect(immutableMatchIds(played)).toEqual(["x1", "x2", "x3", "x4"]);
    expect(roundIsEditable(played)).toBe(false);
    expect(roundIsEditable([{ id: "y1", status: "scheduled" } as any])).toBe(true);
  });

  it("lets the admin re-pair an unplayed next round", () => {
    const winners = winnersAsEntrants(played, (id) => id);
    let board = suggestNextRoundBoard({ groupNumber: 1, section: 1, round: 2, winners });
    board = moveEntrant(board, "m2", findSlot(board, "m4")!);
    const rows = drawToMatchRows({ champId: "c1", board, entrants: winners });
    expect(rows.map((r) => [r.player_a_member_id, r.player_b_member_id])).toEqual([
      ["m1", "m2"],
      ["m3", "m4"],
    ]);
    expect(rows.every((r) => r.round_number === 2)).toBe(true);
  });
});

describe("integrity gates", () => {
  it("never produces a self-match, even from a hand-arranged board", () => {
    const list = entrants(4);
    const board = {
      groupNumber: 1,
      round: 1,
      matches: [{ section: 1, round: 1, position: 1, a: "m1", b: "m1" }],
    } as any;
    expect(() => drawToMatchRows({ champId: "c1", board, entrants: list })).toThrow();
  });

  it("labels multi-section rows and keeps sections apart", () => {
    const list = entrants(8);
    const board = {
      groupNumber: 2,
      round: 1,
      matches: [
        { section: 1, round: 1, position: 1, a: "m1", b: "m2" },
        { section: 2, round: 1, position: 1, a: "m3", b: "m4" },
      ],
    } as any;
    const rows = drawToMatchRows({ champId: "c1", board, entrants: list, multiSection: true });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.section_number)).toEqual([1, 2]);
    expect(rows.every((r) => r.group_number === 2)).toBe(true);
    expect(rows[0].stage_label).toContain("Section A");
    expect(rows[1].stage_label).toContain("Section B");
  });

  it("creates the next round at the next round number without touching the played one", () => {
    const played = [
      { bracket_position: 1, player_a_member_id: "m1", player_b_member_id: "m2", winner_member_id: "m1", status: "completed" },
      { bracket_position: 2, player_a_member_id: "m3", player_b_member_id: "m4", winner_member_id: "m4", status: "completed" },
    ] as any[];
    const winners = winnersAsEntrants(played, (id) => id);
    const board = suggestNextRoundBoard({ groupNumber: 1, section: 1, round: 2, winners });
    const rows = drawToMatchRows({ champId: "c1", board, entrants: winners });
    expect(rows).toHaveLength(1);
    expect(rows[0].round_number).toBe(2);
    expect(rows[0].status).toBe("scheduled");
    expect([rows[0].player_a_member_id, rows[0].player_b_member_id].sort()).toEqual(["m1", "m4"]);
    // the completed feeder rows are untouched
    expect(played.every((m) => m.status === "completed")).toBe(true);
  });

  it("generated rounds start unscheduled so the admin must allocate court and time", () => {
    const list = entrants(4);
    const rows = drawToMatchRows({ champId: "c1", board: suggestFromEntrants(1, list), entrants: list });
    expect(rows.every((r) => !(r as any).court_id && !(r as any).scheduled_at)).toBe(true);
  });
});

describe("confirmed draws stay put", () => {
  it("keeps the admin's pairings when the field is unchanged", async () => {
    const { reconcileBoardWithEntrants } = await import("@/lib/tournaments/draw-board");
    const list = entrants(8);
    const board = moveEntrant(suggestFromEntrants(1, list), "m2", findSlot(suggestFromEntrants(1, list), "m8")!);
    const rec = reconcileBoardWithEntrants(board, list.map((e) => e.id));
    expect(rec.usable).toBe(true);
    expect(rec.board.matches).toEqual(board.matches);
  });

  it("lifts a withdrawn player off without discarding the draw", async () => {
    const { reconcileBoardWithEntrants } = await import("@/lib/tournaments/draw-board");
    const list = entrants(8);
    const board = suggestFromEntrants(1, list);
    const rec = reconcileBoardWithEntrants(board, list.filter((e) => e.id !== "m8").map((e) => e.id));
    expect(rec.usable).toBe(true);
    expect(rec.dropped).toEqual(["m8"]);
    expect(findSlot(rec.board, "m8")).toBeNull();
    expect(findSlot(rec.board, "m1")).toEqual(findSlot(board, "m1"));
  });

  it("flags a brand-new entrant instead of silently reseeding", async () => {
    const { reconcileBoardWithEntrants } = await import("@/lib/tournaments/draw-board");
    const list = entrants(8);
    const board = suggestFromEntrants(1, list);
    const rec = reconcileBoardWithEntrants(board, [...list.map((e) => e.id), "m9"]);
    expect(rec.usable).toBe(false);
    expect(rec.missing).toEqual(["m9"]);
  });
});
