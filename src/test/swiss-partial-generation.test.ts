import { describe, expect, it } from "vitest";
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";
import { prospectiveSwissPolicy } from "@/lib/tournaments/swiss-sequencing-policy";

const policy = prospectiveSwissPolicy("new-test", "2026-10-27T00:00:00Z");
const P = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
const done = (round: number, a: string, b: string) => ({ id: `r${round}-${a}-${b}`, round, a, b, winner: a, status: "completed" });
const open = (round: number, a: string, b: string) => ({ id: `r${round}-${a}-${b}-open`, round, a, b, winner: null, status: "scheduled" });

/** Hand-verified 8-player scenario (see swiss-settled.test.ts): one undecided R2 game, P6 v P7. */
const model = (extra: any[] = []) => buildSwissProgression({
  seedOrder: P, names: {}, totalRounds: 5, swissSequencing: policy, tournamentId: "new-test",
  matches: [
    done(1, "P1", "P8"), done(1, "P2", "P7"), done(1, "P3", "P6"), done(1, "P4", "P5"),
    done(2, "P1", "P4"), done(2, "P2", "P3"), done(2, "P8", "P5"), open(2, "P6", "P7"),
    ...extra,
  ],
});

const pairOf = (b: { rows: [{ id: string | null }, { id: string | null }] }) => [b.rows[0].id, b.rows[1].id].sort().join("|");

describe("partial Swiss round generation (settled positions)", () => {
  it("offers only the provably stable certified pairings while a game is undecided", () => {
    const grid = buildProposedSwissGrid(model(), { schedule: null, partialGeneration: true });
    const r3 = grid.rounds.find((r) => r.round === 3)!;
    const certified = r3.blocks.filter((b) => b.certified);
    // The optimizer's lookahead may pair P3/P4 differently across scenarios — only P1 v P2 is provably stable.
    expect(certified.map(pairOf).sort()).toEqual(["P1|P2"]);
    // Every other slot stays open — no ids, no names.
    const rest = r3.blocks.filter((b) => !b.certified);
    expect(rest.length).toBeGreaterThan(0);
    for (const b of rest) for (const row of b.rows) expect(row.id).toBeNull();
  });

  it("offers nothing without the pilot flag, even with the sequencing policy active", () => {
    const grid = buildProposedSwissGrid(model(), { schedule: null });
    const r3 = grid.rounds.find((r) => r.round === 3)!;
    expect(r3.blocks.every((b) => !b.certified)).toBe(true);
    for (const b of r3.blocks) for (const row of b.rows) expect(row.id).toBeNull();
  });

  it("offers nothing for legacy stages without the sequencing policy", () => {
    const legacy = buildSwissProgression({
      seedOrder: P, names: {}, totalRounds: 5,
      matches: [
        done(1, "P1", "P8"), done(1, "P2", "P7"), done(1, "P3", "P6"), done(1, "P4", "P5"),
        done(2, "P1", "P4"), done(2, "P2", "P3"), done(2, "P8", "P5"), open(2, "P6", "P7"),
      ],
    });
    const grid = buildProposedSwissGrid(legacy, { schedule: null, partialGeneration: true });
    const r3 = grid.rounds.find((r) => r.round === 3)!;
    expect(r3.blocks.every((b) => !b.certified)).toBe(true);
  });

  it("fills only the missing pairs of a half-created round once the previous round completes", () => {
    // R2 fully decided; R3 already contains the saved P1 v P2 game (created early as certified).
    const m = buildSwissProgression({
      seedOrder: P, names: {}, totalRounds: 5, swissSequencing: policy, tournamentId: "new-test",
      matches: [
        done(1, "P1", "P8"), done(1, "P2", "P7"), done(1, "P3", "P6"), done(1, "P4", "P5"),
        done(2, "P1", "P4"), done(2, "P2", "P3"), done(2, "P8", "P5"), done(2, "P6", "P7"),
        { id: "r3-saved", round: 3, a: "P1", b: "P2", winner: null, status: "scheduled" },
      ],
    });
    const grid = buildProposedSwissGrid(m, { schedule: null, partialGeneration: true });
    const r3 = grid.rounds.find((r) => r.round === 3)!;
    expect(r3.created).toBe(true);
    expect(r3.blocks).toHaveLength(4); // the saved game + the three still-missing pairs
    const saved = r3.blocks.filter((b) => b.saved);
    expect(saved.map(pairOf)).toEqual(["P1|P2"]);
    const proposed = r3.blocks.filter((b) => !b.saved);
    expect(proposed).toHaveLength(3);
    for (const b of proposed) for (const row of b.rows) expect(["P1", "P2"]).not.toContain(row.id);
    // A full legal round: every player appears exactly once across saved + proposed.
    expect(r3.blocks.flatMap((b) => b.rows.map((r) => r.id)).sort()).toEqual([...P].sort());
  });
});

describe("certified round-robin finish block", () => {
  const rrModel = (flag: boolean) => {
    const r1 = Array.from({ length: 9 }, (_, i) => ({ id: `r1-${i}`, round: 1, a: `p${i + 1}`, b: `p${i + 10}`, winner: `p${i + 1}`, status: "completed" }));
    const r2 = [
      ["p1", "p2"], ["p3", "p4"], ["p5", "p6"], ["p7", "p8"],
      ["p9", "p10"], ["p11", "p12"], ["p13", "p14"], ["p15", "p16"],
    ].map(([a, b], i) => ({ id: `r2-${i}`, round: 2, a, b, winner: a, status: "completed" }));
    r2.push({ id: "r2-open", round: 2, a: "p17", b: "p18", winner: null, status: "scheduled" });
    const m = buildSwissProgression({ seedOrder: Array.from({ length: 18 }, (_, i) => `p${i + 1}`), names: {}, totalRounds: 5, matches: [...r1, ...r2] });
    m.rrFinish = { enabled: true, groups: 3 };
    return buildProposedSwissGrid(m, { schedule: null, ...(flag ? { partialGeneration: true } : {}) });
  };

  it("certifies each round-robin group independently once its four positions are final", () => {
    const grid = rrModel(true);
    const certified = grid.rounds.filter((r) => r.round >= 3).flatMap((r) => r.blocks.filter((b) => b.certified));
    // Positions 1-8 are provably final (groups A and B); positions 9-12 still move with p17 v p18.
    expect(certified).toHaveLength(12); // 2 groups × 2 games × 3 rounds
    for (const b of certified) {
      expect(b.rows[0].id).not.toBeNull();
      expect(b.rows[1].id).not.toBeNull();
      expect(Math.max(b.rows[0].pos ?? 99, b.rows[1].pos ?? 99)).toBeLessThanOrEqual(8);
    }
    // Group C and the Swiss remainder are not final while p17 v p18 is open.
    const rest = grid.rounds.filter((r) => r.round >= 3).flatMap((r) => r.blocks.filter((b) => (b.rows[0].pos ?? 0) >= 9 || (b.rows[1].pos ?? 0) >= 9));
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((b) => !b.certified)).toBe(true);
  });

  it("certifies nothing without the pilot flag", () => {
    const grid = rrModel(false);
    expect(grid.rounds.flatMap((r) => r.blocks).every((b) => !b.certified)).toBe(true);
  });
});
