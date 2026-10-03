import { describe, it, expect } from "vitest";
import { generateStructuredTournament, type Db } from "@/lib/tournaments/structured-persist";
import { autoProgress } from "@/lib/tournaments/progression";

/** In-memory DB mirroring the identity trigger and guard_structured_stage_round_once. */
function fakeDb() {
  const t: Record<string, any[]> = {};
  let n = 0;
  const match = (r: any, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
  const db: Db = {
    async insert(table, rows) {
      const out = rows.map((r) => ({ id: `${table}-${++n}`, ...r }));
      if (table === "club_champs_matches") for (const m of out as any[]) {
        if (!m.division_id || !m.stage_id || !m.round_id) throw new Error("identity");
        if ((t.club_champs_matches ?? []).some((x) => x.stage_id === m.stage_id && x.round_number === m.round_number))
          throw new Error("This stage round already has games (already generated)");
      }
      (t[table] ??= []).push(...out);
      return out;
    },
    async select(table, f) { return (t[table] ?? []).filter((r) => match(r, f)); },
    async update(table, f, patch) { (t[table] ?? []).filter((r) => match(r, f)).forEach((r) => Object.assign(r, patch)); },
  };
  return { db, t };
}

const unit = (id: string, pool: number, position: number) => ({ id, slots: [{ pool, position }] });
const fixed = (date: string) => ({ rule: "fixed", date, timeFrom: "16:25", timeTo: "20:25", courtIds: [20, 21], roundDates: [date] });

/** Same shape as River 2 Clubs: Pools (play-by) → QF → SF → Final (fixed sessions), identical stage keys in every draw. */
function division(g: number) {
  return {
    divisionId: `g${g}`, groupNumber: g, label: `Draw ${g}`, unit: "players", seeding: { method: "snake", source: "entry_order" },
    placements: "champion", finalStandings: "last_stage", deferredStages: [], entrants: [],
    stages: [
      { id: "main", kind: "pools", name: "Pools", order: 0, pools: 2, poolSize: 4, discipline: "singles",
        schedule: { rule: "play_by", deadline: "2026-10-17", roundDates: ["2026-10-06", "2026-10-12", "2026-10-17"] } },
      { id: "po1", kind: "mapped", name: "Quarterfinals", order: 1, discipline: "singles", generation: "automatic", waitForOrganiser: false,
        progression: { mode: "all_continue", standings: "reset" }, schedule: fixed("2026-10-22"),
        mapping: { source: "stage_standings", sourceStageId: "main", pools: 2, poolSize: 4, discipline: "singles",
          units: [unit("A1", 0, 1), unit("B4", 1, 4), unit("B2", 1, 2), unit("A3", 0, 3), unit("B1", 1, 1), unit("A4", 0, 4), unit("A2", 0, 2), unit("B3", 1, 3)],
          matches: [{ a: "A1", b: "B4", order: 1, round: 1 }, { a: "B2", b: "A3", order: 2, round: 1 }, { a: "B1", b: "A4", order: 3, round: 1 }, { a: "A2", b: "B3", order: 4, round: 1 }] } },
      { id: "po2", kind: "mapped", name: "Semifinals", order: 2, discipline: "singles", generation: "automatic", waitForOrganiser: false,
        progression: { mode: "all_continue", standings: "reset" }, schedule: fixed("2026-10-25"),
        mapping: { source: "stage_winners", sourceStageId: "po1", pools: 1, poolSize: 4, discipline: "singles",
          units: [unit("A1", 0, 1), unit("A2", 0, 2), unit("A3", 0, 3), unit("A4", 0, 4)],
          matches: [{ a: "A1", b: "A2", order: 1, round: 1 }, { a: "A3", b: "A4", order: 2, round: 1 }] } },
      { id: "po3", kind: "mapped", name: "Final", order: 3, discipline: "singles", generation: "automatic", waitForOrganiser: false,
        progression: { mode: "all_continue", standings: "reset" }, schedule: fixed("2026-10-28"),
        mapping: { source: "stage_winners", sourceStageId: "po2", pools: 1, poolSize: 2, discipline: "singles",
          units: [unit("A1", 0, 1), unit("A2", 0, 2)], matches: [{ a: "A1", b: "A2", order: 1, round: 1 }] } },
    ],
  };
}

function setup() {
  const env = fakeDb();
  const spec = { name: "River-like", version: 1, architecture: "structured", divisions: [1, 2, 3, 4, 5].map(division) };
  env.t.tournaments = [{ id: "t", builder_architecture: "structured", builder_spec: spec, start_date: "2026-10-01", end_date: "2026-10-31" }];
  env.t.club_champs_entries = [1, 2, 3, 4, 5].flatMap((g) => Array.from({ length: 8 }, (_, i) => ({ id: `e${g}-${i}`, champ_id: "t", club_member_id: `g${g}p${i + 1}`, group_number: g, order_index: i })));
  return env;
}
const num = (id: string) => Number(id.split("p")[1]);
function play(env: ReturnType<typeof fakeDb>, stage: string, groups?: number[]) {
  for (const m of env.t.club_champs_matches.filter((x: any) => x.stage_key === stage && (!groups || groups.includes(x.group_number)) && !x.winner_member_id)) {
    m.winner_member_id = num(m.player_a_member_id) < num(m.player_b_member_id) ? m.player_a_member_id : m.player_b_member_id;
    m.status = "completed";
  }
}
const sfs = (env: ReturnType<typeof fakeDb>) => env.t.club_champs_matches.filter((m: any) => m.stage_key === "po2");

describe("Semifinals are generated per draw, scheduled only by the Semifinal stage", () => {
  it("partial readiness: only QF-complete draws get their own two Semifinals; the rest follow once ready → 10 total", async () => {
    const env = setup();
    await generateStructuredTournament(env.db, "t");
    play(env, "main");
    await autoProgress(env.db, "t");
    expect(env.t.club_champs_matches.filter((m: any) => m.stage_key === "po1")).toHaveLength(20);

    play(env, "po1", [1, 2, 3]); // draws 4 and 5 still have QFs open
    await autoProgress(env.db, "t");
    expect(sfs(env)).toHaveLength(6);
    expect([...new Set(sfs(env).map((m: any) => m.group_number))].sort()).toEqual([1, 2, 3]);

    play(env, "po1", [4, 5]);
    await autoProgress(env.db, "t");
    expect(sfs(env)).toHaveLength(10);
    for (const g of [1, 2, 3, 4, 5]) {
      const mine = sfs(env).filter((m: any) => m.group_number === g);
      expect(mine).toHaveLength(2);
      // Never combine winners across draws: every SF player is from this draw's own QF winners.
      const qfWinners = new Set(env.t.club_champs_matches.filter((m: any) => m.stage_key === "po1" && m.group_number === g).map((m: any) => m.winner_member_id));
      for (const m of mine) { expect(qfWinners.has(m.player_a_member_id)).toBe(true); expect(qfWinners.has(m.player_b_member_id)).toBe(true); }
      // Fixed feeder paths: SF1 = W(QF1) v W(QF2), SF2 = W(QF3) v W(QF4).
      expect(mine.map((m: any) => `${m.placeholder_a} v ${m.placeholder_b}`).sort()).toEqual(["Winner QF1 v Winner QF2", "Winner QF3 v Winner QF4"]);
    }
  });

  it("target-stage scheduling: fixed Semifinal session date, never the pool/QF play-by", async () => {
    const env = setup();
    await generateStructuredTournament(env.db, "t");
    play(env, "main");
    await autoProgress(env.db, "t");
    play(env, "po1");
    await autoProgress(env.db, "t");
    for (const m of sfs(env)) {
      expect(m.scheduled_date).toBe("2026-10-25");
      expect(m.play_by ?? null).toBeNull();
      const round = env.t.club_champs_rounds.find((r: any) => r.id === m.round_id);
      expect(round.play_by ?? null).toBeNull();
      expect(round.label).toBe("Semifinals");
    }
  });
});
