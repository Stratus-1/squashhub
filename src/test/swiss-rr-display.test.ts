import { describe, expect, it } from "vitest";
import { buildSwissProgression, type ProgressionMatchInput } from "@/lib/tournaments/swiss-progression-view";
import { hasSwissMatchActivity, swissRrDisplay } from "@/lib/tournaments/swiss-rr-display";
import { RIVERSIDE_CLUB_ID } from "@/lib/tournaments/swiss-riverside-aabb-charts";

const match = (extra: Partial<ProgressionMatchInput> = {}): ProgressionMatchInput => ({ id: "r3", round: 3, a: "p1", b: "p4", winner: null, status: "scheduled", ...extra });
function scenario(n: number, groups: number, later: ProgressionMatchInput[] = [], qualify = true) {
  const seedOrder = Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const matches = qualify ? [1, 2].flatMap((round) => Array.from({ length: n / 2 }, (_, i) => match({ id: `r${round}-${i}`, round, a: seedOrder[i], b: seedOrder[n - i - 1], winner: seedOrder[i], status: "completed", score: "3-1" }))) : [];
  const model = buildSwissProgression({ seedOrder, names: {}, matches: [...matches, ...later], totalRounds: 5 });
  model.rrFinish = { enabled: true, groups };
  return model;
}

describe("Riverside RR phase visibility and fixed groups", () => {
  it.each([[16, 4], [18, 3]])("%i players/%i groups: hidden before qualification and while R3 is only drawn/scheduled", (n, groups) => {
    expect(swissRrDisplay(scenario(n, groups, [], false), RIVERSIDE_CLUB_ID).showStandings).toBe(false);
    const d = swissRrDisplay(scenario(n, groups, [match({ date: "2020-01-01", time: "18:00" })]), RIVERSIDE_CLUB_ID);
    expect(d.locked).toBe(true);
    expect(d.showStandings).toBe(false);
    expect(d.groupRanges).toHaveLength(groups);
    expect(d.memberships.size).toBe(n);
    expect(d.remainder).toEqual(n === 18 ? [13, 18] : null);
    expect([...d.memberships.values()].filter((x) => x.group === null)).toHaveLength(n === 18 ? 6 : 0);
  });
  it.each([[16, 4], [18, 3]])("%i/%i: first real R3 point reveals the table without moving fixed memberships", (n, groups) => {
    const before = swissRrDisplay(scenario(n, groups), RIVERSIDE_CLUB_ID);
    const started = swissRrDisplay(scenario(n, groups, [match({ status: "in_progress", sideBPoints: 1 })]), RIVERSIDE_CLUB_ID);
    const completed = swissRrDisplay(scenario(n, groups, [match({ status: "completed", winner: "p4", score: "0-3" })]), RIVERSIDE_CLUB_ID);
    expect(started.showStandings).toBe(true);
    expect(completed.showStandings).toBe(true);
    expect(completed.snapshot).toEqual(before.snapshot);
    expect(completed.memberships).toEqual(before.memberships);
  });
  it("R1–R2 activity cannot show RR standings, even after the qualification lock", () => {
    expect(swissRrDisplay(scenario(16, 4), RIVERSIDE_CLUB_ID).showStandings).toBe(false);
    expect(swissRrDisplay(scenario(16, 4, [match({ status: "in_progress", sideAPoints: 1 })], false), RIVERSIDE_CLUB_ID).showStandings).toBe(false);
  });
  it("works for every club when switched on; switched off stays normal Swiss", () => {
    const model = scenario(18, 3, [match({ status: "completed", winner: "p1", score: "3-0" })]);
    expect(swissRrDisplay(model, "uitsig").enabled).toBe(true);
    model.rrFinish = { enabled: false, groups: 3 };
    expect(swissRrDisplay(model, RIVERSIDE_CLUB_ID)).toMatchObject({ enabled: false, showStandings: false });
  });
  it("view-only 0–0, byes, forfeits, cancelled/void and later stages do not start the phase", () => {
    const rejected = [match({ status: "in_progress" }), match({ isBye: true, b: null, status: "completed", winner: "p1" }), match({ status: "completed", forfeitMemberId: "p4", winner: "p1", score: "3-0" }), match({ status: "cancelled", sideAPoints: 1 }), match({ status: "void", score: "3-0" })];
    expect(rejected.map(hasSwissMatchActivity)).toEqual([false, false, false, false, false]);
    expect(swissRrDisplay(scenario(18, 3, [match({ round: 6, status: "completed", winner: "p1", score: "3-0" })]), RIVERSIDE_CLUB_ID).showStandings).toBe(false);
  });
  it("persisted game points keep started state through game reset, pause and reload", () => {
    expect(hasSwissMatchActivity(match({ status: "in_progress", gameScores: JSON.stringify({ sets: [{ a: 11, b: 8 }], current: { a: 0, b: 0 } }) }))).toBe(true);
    expect(hasSwissMatchActivity(match({ status: "paused", gameScores: { current: { a: 1, b: 0 } } }))).toBe(true);
    expect(hasSwissMatchActivity(match({ status: "in_progress", gameScores: "invalid" }))).toBe(false);
  });
});
describe("Riverside pairing-group colours and headings", () => {
  it.each([[16, 4], [18, 3]])("%i/%i: before R2 ends colour follows the slot; after, it locks to the player", (n, groups) => {
    const pre = swissRrDisplay(scenario(n, groups, [], false), RIVERSIDE_CLUB_ID);
    expect(pre.heading).toBe("Projected Pairing Groups — Swiss Rounds 1–2 | Round Robin Rounds 3–5");
    expect([1, 4, 5, 8, 9, 12].map((s) => pre.groupOf("x", s))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(pre.groupOf("x", 13)).toBe(n === 16 ? 4 : "swiss");
    const post = swissRrDisplay(scenario(n, groups), RIVERSIDE_CLUB_ID);
    expect(post.heading.startsWith("Confirmed Pairing Groups")).toBe(true);
    const first = post.snapshot[0];
    expect(post.groupOf(first, 99)).toBe(1); // slot no longer matters
    expect(post.remainderLabel).toBe("Continued Swiss Pairing — Rounds 1–5");
    if (n === 18) expect(post.groupOf(post.snapshot[17], 1)).toBe("swiss");
  });
  it("normal Swiss (RR finish off) gets no colours at any club", () => {
    const m = scenario(16, 4); m.rrFinish = { enabled: false, groups: 4 };
    expect(swissRrDisplay(m, "uitsig").groupOf("p1", 1)).toBeNull();
  });
});
