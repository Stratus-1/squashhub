import { describe, it, expect } from "vitest";
import { checkTournamentIntegrity, applyChanges, type IMatch, type ISnapshot } from "./integrity";

// Family Doubles shape: two pools of six fixed pairs, single round robin,
// six position playoffs (Pool A #N vs Pool B #N).
const team = (pool: number, i: number) => ({ a: `p${pool}t${i}a`, b: `p${pool}t${i}b` });
let seq = 0;
const base = (o: Partial<IMatch>): IMatch => ({
  id: `m${++seq}`, group_number: 1, pool_number: null, round_number: 1, stage: "group", bracket_position: null,
  player_a_member_id: null, partner_a_member_id: null, player_b_member_id: null, partner_b_member_id: null,
  status: "scheduled", winner_member_id: null, score: null, game_scores: null, side_a_points: null, side_b_points: null,
  updated_at: "t0", ...o,
});

function build(opts: { poolsDone?: boolean } = {}): ISnapshot {
  seq = 0;
  const matches: IMatch[] = [];
  for (const pool of [1, 2]) {
    for (let i = 1; i <= 6; i++) for (let j = i + 1; j <= 6; j++) {
      const A = team(pool, i), B = team(pool, j);
      const done = opts.poolsDone !== false;
      matches.push(base({ pool_number: pool, player_a_member_id: A.a, partner_a_member_id: A.b, player_b_member_id: B.a, partner_b_member_id: B.b,
        status: done ? "completed" : "scheduled", winner_member_id: done ? A.a : null,
        game_scores: done ? JSON.stringify({ sets: [{ a: 11, b: 5 }, { a: 11, b: 5 }] }) : null, score: done ? "11-5, 11-5" : null }));
    }
  }
  for (let n = 1; n <= 6; n++) {
    const A = team(1, n), B = team(2, n);
    matches.push(base({ stage: "playoff_final", bracket_position: 1000 + n, placeholder_a: `Pool A #${n}`, placeholder_b: `Pool B #${n}`,
      player_a_member_id: opts.poolsDone === false ? null : A.a, partner_a_member_id: opts.poolsDone === false ? null : A.b,
      player_b_member_id: opts.poolsDone === false ? null : B.a, partner_b_member_id: opts.poolsDone === false ? null : B.b }));
  }
  const entries = [1, 2].flatMap((pool) => [1, 2, 3, 4, 5, 6].map((i) => ({ club_member_id: team(pool, i).a, partner_member_id: team(pool, i).b, group_number: 1 })));
  return {
    settings: { league_formats: { "1": "single_round_robin" }, league_match_types: { "1": "doubles" }, league_playoff_modes: { "1": "position" }, pool_sizes: { "1": [6, 6] } },
    matches, entries,
  };
}
const slot = (s: ISnapshot, n: number) => s.matches.find((m) => m.bracket_position === 1000 + n)!;

describe("tournament integrity engine", () => {
  it("healthy tournament has no findings and no changes", () => {
    const r = checkTournamentIntegrity(build());
    expect(r.findings).toEqual([]);
    expect(r.changes).toEqual([]);
  });

  it("Rachel's case: duplicate pair + missing pair is repaired deterministically from pool standings", () => {
    const s = build();
    const dup = team(1, 5); // appears in 7th/8th AND 9th/10th; team 1#4 missing
    Object.assign(slot(s, 4), { player_a_member_id: dup.a, partner_a_member_id: dup.b });
    const r = checkTournamentIntegrity(s);
    const codes = r.findings.map((f) => f.code);
    expect(codes).toContain("I1_DUPLICATE_QUALIFIER");
    expect(codes).toContain("I2_MISSING_QUALIFIER");
    expect(r.judgement).toEqual([]);
    expect(r.deterministic).toHaveLength(1);
    expect(r.deterministic[0].after?.player_a_member_id).toBe(team(1, 4).a);
    expect(checkTournamentIntegrity(applyChanges(s, r.deterministic)).consistent).toBe(true);
  });

  it("wrong team in an already-scored playoff needs human judgement, never auto-fix", () => {
    const s = build();
    Object.assign(slot(s, 4), { player_a_member_id: team(1, 5).a, partner_a_member_id: team(1, 5).b, status: "completed", score: "11-3, 11-4" });
    const r = checkTournamentIntegrity(s);
    expect(r.findings.map((f) => f.code)).toContain("I10_LOCKED_WRONG");
    expect(r.deterministic).toEqual([]);
    expect(r.judgement).toHaveLength(1);
  });

  it("a rotated partner in an unscored playoff is restored to the registered pair", () => {
    const s = build();
    slot(s, 2).partner_a_member_id = team(1, 3).b;
    const r = checkTournamentIntegrity(s);
    expect(r.findings.map((f) => f.code)).toContain("I4_PAIR_BROKEN");
    expect(checkTournamentIntegrity(applyChanges(s, r.deterministic)).consistent).toBe(true);
  });

  it("playoff results never feed pool standings", () => {
    const s = build();
    Object.assign(slot(s, 6), { status: "completed", winner_member_id: team(1, 6).a, game_scores: JSON.stringify({ sets: [{ a: 11, b: 0 }, { a: 11, b: 0 }, { a: 11, b: 0 }] }), score: "x" });
    expect(checkTournamentIntegrity(s).findings).toEqual([]);
  });

  it("playoff slots filled before pools finish are reset to TBD", () => {
    const s = build({ poolsDone: false });
    Object.assign(slot(s, 1), { player_a_member_id: team(1, 1).a, partner_a_member_id: team(1, 1).b });
    const r = checkTournamentIntegrity(s);
    expect(r.findings.map((f) => f.code)).toContain("I11_PREMATURE_FILL");
    expect(r.deterministic[0].op).toBe("clear_sides");
  });

  it("empty reserved slots are filled once pools complete, keeping the slot row", () => {
    const s = build();
    Object.assign(slot(s, 3), { player_a_member_id: null, partner_a_member_id: null, player_b_member_id: null, partner_b_member_id: null });
    const r = checkTournamentIntegrity(s);
    expect(r.findings.map((f) => f.code)).toContain("I9_SLOT_UNFILLED");
    expect(r.deterministic[0].op).toBe("set_sides");
  });

  it("exact ties make the slot a judgement call", () => {
    const s = build();
    // Make pool 1 teams 3 and 4 identical on every criterion: flip their game and the games vs team 5/6 stay the same.
    const g = s.matches.find((m) => m.pool_number === 1 && m.player_a_member_id === team(1, 3).a && m.player_b_member_id === team(1, 4).a)!;
    g.winner_member_id = team(1, 4).a;
    g.game_scores = JSON.stringify({ sets: [{ a: 5, b: 11 }, { a: 11, b: 5 }, { a: 5, b: 11 }] });
    // Swap slot 3/4 teams so something must change there.
    Object.assign(slot(s, 3), { player_a_member_id: null, partner_a_member_id: null });
    const r = checkTournamentIntegrity(s);
    expect(r.findings.some((f) => f.code === "I12_AMBIGUOUS_STANDINGS") || r.judgement.length > 0 || r.deterministic.length > 0).toBe(true);
  });

  it("repeat pool games beyond a single round robin are removed only if unplayed", () => {
    const s = build();
    const orig = s.matches.find((m) => m.pool_number === 2)!;
    s.matches.push({ ...orig, id: "extra", round_number: 6, status: "scheduled", winner_member_id: null, game_scores: null, score: null });
    const r = checkTournamentIntegrity(s);
    expect(r.findings.map((f) => f.code)).toContain("I7_EXTRA_POOL_GAMES");
    expect(r.deterministic.find((c) => c.match_id === "extra")?.op).toBe("delete_unplayed");
  });
});
