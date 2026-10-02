/**
 * End-to-end regression: completed two-pool stage → Quarterfinals → Semifinals → Final.
 *
 * Mirrors the River 2 Clubs stage shape (pools of 5 and 4, mapped QF from pool positions,
 * SF/Final from stage winners, scheduled play-offs). Source pool membership, every completed
 * pool game and every P/W/L/GD/GW/points line are snapshotted and must be IDENTICAL after each
 * later stage — singles and doubles. Revisiting a created stage must never duplicate games.
 */
import { describe, it, expect } from "vitest";
import { generateStructuredTournament, rankSourcePools, type Db } from "@/lib/tournaments/structured-persist";
import { autoProgress, previewNextStage, stageLifecycle } from "@/lib/tournaments/progression";
import { gameSetsOf } from "@/lib/tournaments/tie-breaks";

function fakeDb() {
  const t: Record<string, any[]> = {};
  let n = 0;
  const match = (r: any, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
  const db: Db = {
    async insert(table, rows) { const out = rows.map((r) => ({ id: `${table}-${++n}`, ...r })); (t[table] ??= []).push(...out); return out.map((r) => ({ ...r })); },
    async select(table, f) { return (t[table] ?? []).filter((r) => match(r, f)).map((r) => ({ ...r })); },
    async update(table, f, patch) { (t[table] ?? []).filter((r) => match(r, f)).forEach((r) => Object.assign(r, patch)); },
    async remove(table, ids) { t[table] = (t[table] ?? []).filter((x) => !ids.includes(x.id)); },
  };
  return { db, t };
}

const unit = (A: string, B: string) => ({ id: `${A}${B}`, slots: [{ pool: A === "A" ? 0 : 1, position: Number(B) }] });
const sched = (date: string) => ({ rule: "fixed", date, timeFrom: "16:00", timeTo: "20:00", courtIds: [1, 2], roundDates: [date] });

function spec(doubles: boolean) {
  const disc = doubles ? "doubles" : "singles";
  return {
    version: 1, architecture: "structured", name: "Pools to Final",
    divisions: [{
      divisionId: "g1", label: "Mens A", unit: doubles ? "pairs" : "players", groupNumber: 1,
      seeding: { method: "snake", source: "entry_order" }, entrants: [], placements: [],
      stages: [
        { id: "main", kind: "pools", name: "Pools", order: 0, pools: 2, poolSize: 5, discipline: disc,
          schedule: { rule: "play_by", deadline: "2026-10-17", roundDates: ["2026-10-06", "2026-10-12", "2026-10-15", "2026-10-16", "2026-10-17"] } },
        { id: "qf", kind: "mapped", name: "Quarterfinals", order: 1, discipline: disc, generation: "automatic", waitForOrganiser: false,
          progression: { mode: "all_continue", standings: "reset" }, schedule: sched("2026-10-22"),
          mapping: { pools: 2, source: "stage_standings", sourceStageId: "main", derived: true, poolSize: 4, discipline: "singles" /* pre-formed pairs are one unit */,
            units: [unit("A", "1"), unit("B", "4"), unit("B", "2"), unit("A", "3"), unit("B", "1"), unit("A", "4"), unit("A", "2"), unit("B", "3")],
            matches: [{ a: "A1", b: "B4", order: 1, round: 1 }, { a: "B2", b: "A3", order: 2, round: 1 }, { a: "B1", b: "A4", order: 3, round: 1 }, { a: "A2", b: "B3", order: 4, round: 1 }] } },
        { id: "sf", kind: "mapped", name: "Semifinals", order: 2, discipline: disc, generation: "automatic", waitForOrganiser: false,
          progression: { mode: "all_continue", standings: "reset" }, schedule: sched("2026-10-25"),
          mapping: { pools: 1, source: "stage_winners", sourceStageId: "qf", derived: true, poolSize: 4, discipline: "singles" /* pre-formed pairs are one unit */,
            units: [1, 2, 3, 4].map((p) => ({ id: `A${p}`, slots: [{ pool: 0, position: p }] })),
            matches: [{ a: "A1", b: "A2", order: 1, round: 1 }, { a: "A3", b: "A4", order: 2, round: 1 }] } },
        { id: "fin", kind: "mapped", name: "Final", order: 3, discipline: disc, generation: "automatic", waitForOrganiser: false,
          progression: { mode: "all_continue", standings: "reset" }, schedule: sched("2026-10-28"),
          mapping: { pools: 1, source: "stage_winners", sourceStageId: "sf", derived: true, poolSize: 2, discipline: "singles" /* pre-formed pairs are one unit */,
            units: [1, 2].map((p) => ({ id: `A${p}`, slots: [{ pool: 0, position: p }] })),
            matches: [{ a: "A1", b: "A2", order: 1, round: 1 }] } },
      ],
    }],
  };
}

/** Lower number always wins; score margin varies so GD/GW/points differ between players. */
function play(rows: any[]) {
  for (const m of rows) {
    if (m.winner_member_id || m.is_bye || !m.player_a_member_id || !m.player_b_member_id) continue;
    const num = (id: string) => Number(String(id).replace(/\D/g, "").slice(0, 2));
    const aWins = num(m.player_a_member_id) < num(m.player_b_member_id);
    const lose = (num(m.player_a_member_id) + num(m.player_b_member_id)) % 3; // 0..2 games conceded
    const sets = Array.from({ length: 3 + lose }, (_, i) => (i < lose ? [7, 11] : [11, 4 + i]));
    const ordered = aWins ? sets : sets.map(([x, y]) => [y, x]);
    Object.assign(m, {
      status: "completed", winner_member_id: aWins ? m.player_a_member_id : m.player_b_member_id,
      score: ordered.map(([x, y]) => `${x}-${y}`).join(", "),
    });
  }
}

function snapshot(t: Record<string, any[]>) {
  const pool = (t.club_champs_matches ?? []).filter((m) => m.stage_key === "main").sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const games = pool.map((m) => ({ id: m.id, pool: m.pool_number, pool_id: m.pool_id, a: m.player_a_member_id, pa: m.partner_a_member_id ?? null, b: m.player_b_member_id, pb: m.partner_b_member_id ?? null, w: m.winner_member_id, score: m.score, status: m.status, stage: m.stage }));
  const line = new Map<string, { P: number; W: number; L: number; GW: number; GL: number; PF: number; PA: number }>();
  for (const m of pool) for (const side of ["a", "b"] as const) {
    const id = m[`player_${side}_member_id`];
    const l = line.get(id) ?? { P: 0, W: 0, L: 0, GW: 0, GL: 0, PF: 0, PA: 0 }; line.set(id, l);
    l.P++; if (m.winner_member_id === id) l.W++; else l.L++;
    for (const [x, y] of gameSetsOf(m).sets ?? []) {
      const [me, op] = side === "a" ? [x, y] : [y, x];
      if (me > op) l.GW++; else l.GL++; l.PF += me; l.PA += op;
    }
  }
  const membership = [...new Set(pool.map((m) => m.pool_number))].sort().map((p) => [...new Set(pool.filter((m) => m.pool_number === p).flatMap((m) => [m.player_a_member_id, m.player_b_member_id]))].sort());
  return JSON.parse(JSON.stringify({ games, membership, lines: [...line.entries()].sort(), pools: (t.tournament_pools ?? []).map((p) => ({ ...p })) }));
}

async function setup(doubles: boolean) {
  const env = fakeDb();
  env.t.tournaments = [{ id: "T", builder_architecture: "structured", builder_spec: spec(doubles), start_date: "2026-10-01", end_date: "2026-10-31" }];
  env.t.club_champs_entries = Array.from({ length: 9 }, (_, i) => ({
    id: `e${i}`, champ_id: "T", group_number: 1, order_index: i,
    club_member_id: `p${String(i + 10)}`, partner_member_id: doubles ? `q${String(i + 10)}` : null,
  }));
  await generateStructuredTournament(env.db, "T");
  play(env.t.club_champs_matches.filter((m) => m.stage_key === "main"));
  return env;
}

for (const doubles of [false, true]) {
  describe(`two pools → QF → SF → Final (${doubles ? "doubles" : "singles"})`, () => {
    it("keeps pool membership, every pool result and every standings line identical through each stage", async () => {
      const env = await setup(doubles);
      const pool = env.t.club_champs_matches.filter((m) => m.stage_key === "main");
      expect(new Set(pool.map((m) => m.pool_number)).size).toBe(2);
      // 5 + 4 entrants → 10 + 6 games, no cross-pool games.
      expect(pool.length).toBe(16);
      const before = snapshot(env.t);
      expect(before.membership.map((m: string[]) => m.length).sort()).toEqual([4, 5]);

      for (const [key, count] of [["qf", 4], ["sf", 2], ["fin", 1]] as const) {
        await autoProgress(env.db, "T");
        const created = env.t.club_champs_matches.filter((m) => m.stage_key === key);
        expect(created).toHaveLength(count);
        // Play-offs are play-off games: no pool, ko stage, own schedule — never pool round metadata.
        for (const m of created) {
          expect(m.stage).toBe("ko");
          expect(m.pool_id ?? null).toBeNull();
          expect(m.play_by ?? null).toBeNull();
          if (doubles) expect(m.partner_a_member_id && m.partner_b_member_id).toBeTruthy();
        }
        expect(snapshot(env.t)).toEqual(before);
        // Revisit: nothing new may be created and the source stays untouched.
        const n = env.t.club_champs_matches.length;
        await autoProgress(env.db, "T");
        await expect(previewNextStage(env.db, "T", "g1", key)).rejects.toThrow(/already has games/);
        expect(env.t.club_champs_matches.length).toBe(n);
        expect(snapshot(env.t)).toEqual(before);
        play(created);
      }
      const states = await stageLifecycle(env.db, "T");
      expect(states.every((s) => s.state === "completed")).toBe(true);
    });

    it("QF pairings are exactly the configured pool positions (A1vB4, B2vA3, B1vA4, A2vB3)", async () => {
      const env = await setup(doubles);
      await autoProgress(env.db, "T");
      const d = (env.t.tournaments[0].builder_spec as any).divisions[0];
      const entrants = env.t.club_champs_entries.map((e) => ({ id: e.partner_member_id ? `${e.club_member_id}+${e.partner_member_id}` : e.club_member_id }));
      const pools = rankSourcePools({ ...d, entrants }, d.stages[0], env.t.club_champs_matches);
      const pos = (p: number, k: number) => pools[p].result.order[k - 1].split("+")[0];
      const want = [[pos(0, 1), pos(1, 4)], [pos(1, 2), pos(0, 3)], [pos(1, 1), pos(0, 4)], [pos(0, 2), pos(1, 3)]].map((x) => x.sort().join("v")).sort();
      const have = env.t.club_champs_matches.filter((m) => m.stage_key === "qf").map((m) => [m.player_a_member_id, m.player_b_member_id].sort().join("v")).sort();
      expect(have).toEqual(want);
    });

    it("Final is fed only by Semifinal winners", async () => {
      const env = await setup(doubles);
      for (let i = 0; i < 3; i++) { await autoProgress(env.db, "T"); play(env.t.club_champs_matches.filter((m) => m.stage === "ko")); }
      const sfWinners = env.t.club_champs_matches.filter((m) => m.stage_key === "sf").map((m) => m.winner_member_id).sort();
      const fin = env.t.club_champs_matches.find((m) => m.stage_key === "fin");
      expect([fin.player_a_member_id, fin.player_b_member_id].sort()).toEqual(sfWinners);
    });
  });
}
