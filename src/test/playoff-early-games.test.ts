import { describe, it, expect } from "vitest";
import { generateStructuredTournament, settledPoolPositions, type Db } from "@/lib/tournaments/structured-persist";
import { autoProgress } from "@/lib/tournaments/progression";
import { placeholderAdoption } from "@/lib/smart-builder/playoff-placeholders";

/** In-memory DB mirroring guard_structured_stage_round_once (later additions: new game number, no shared player). */
function fakeDb() {
  const t: Record<string, any[]> = {};
  let n = 0;
  const match = (r: any, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
  const db: Db = {
    async insert(table, rows) {
      const out = rows.map((r) => ({ id: `${table}-${++n}`, ...r }));
      if (table === "club_champs_matches") for (const m of out as any[]) {
        const clash = (t.club_champs_matches ?? []).some((x) => x.stage_id === m.stage_id && x.round_number === m.round_number
          && (x.bracket_position == null || m.bracket_position == null || x.bracket_position === m.bracket_position
            || [x.player_a_member_id, x.player_b_member_id].some((p) => p && [m.player_a_member_id, m.player_b_member_id].includes(p))));
        if (clash) throw new Error("This stage round already has games (already generated)");
      }
      if (table === "club_champs_rounds") for (const r of out as any[])
        if ((t.club_champs_rounds ?? []).some((x) => x.stage_id === r.stage_id && x.round_number === r.round_number && x.group_number === r.group_number)) throw new Error("duplicate round");
      (t[table] ??= []).push(...out);
      return out;
    },
    async select(table, f) { return (t[table] ?? []).filter((r) => match(r, f)); },
    async update(table, f, patch) { (t[table] ?? []).filter((r) => match(r, f)).forEach((r) => Object.assign(r, patch)); },
  };
  return { db, t };
}

const unit = (id: string, pool: number, position: number) => ({ id, slots: [{ pool, position }] });
const playBy = (d: string) => ({ rule: "play_by", deadline: d });

/** Uitsig Men's A / Ladies B shape: two pools of 4 → Semifinal (top + 5th–8th) → Final (+5th/6th) and 3rd place (+7th/8th). */
function spec() {
  const sf = ["A1", "B2", "B1", "A2", "A3", "B4", "B3", "A4"];
  return {
    name: "Uitsig-like", version: 1, architecture: "structured",
    divisions: [{
      divisionId: "g1", groupNumber: 1, label: "Mens A · Singles", unit: "players", seeding: { method: "snake", source: "entry_order" },
      placements: "champion", finalStandings: "last_stage", deferredStages: [], entrants: [],
      stages: [
        { id: "main", kind: "round_robin", name: "Round robin", order: 0, pools: 2, poolSize: 4, discipline: "singles", schedule: { rule: "play_by", deadline: "2026-11-05", roundDates: ["2026-10-22", "2026-10-29", "2026-11-05"] } },
        { id: "po1", kind: "mapped", name: "Semifinal", order: 1, discipline: "singles", generation: "automatic", waitForOrganiser: false,
          progression: { mode: "all_continue", standings: "reset" }, schedule: playBy("2026-11-12"),
          mapping: { source: "stage_standings", sourceStageId: "main", pools: 2, poolSize: 4, discipline: "singles",
            units: sf.map((k) => unit(k, k[0] === "A" ? 0 : 1, Number(k[1]))),
            matches: [{ a: "A1", b: "B2", order: 1, round: 1 }, { a: "B1", b: "A2", order: 2, round: 1 }, { a: "A3", b: "B4", order: 3, round: 1, label: "Semifinal (5th–8th)" }, { a: "B3", b: "A4", order: 4, round: 1, label: "Semifinal (5th–8th)" }] } },
        { id: "po2-3p", kind: "mapped", name: "3rd place", order: 1.5, discipline: "singles", generation: "automatic", waitForOrganiser: false,
          progression: { mode: "all_continue", standings: "reset" }, schedule: playBy("2026-11-21"),
          mapping: { source: "stage_winners", sourceStageId: "po1", losers: true, pools: 1, poolSize: 4, discipline: "singles",
            units: [unit("A1", 0, 1), unit("A2", 0, 2), unit("A3", 0, 3), unit("A4", 0, 4)],
            matches: [{ a: "A1", b: "A2", order: 1, round: 1 }, { a: "A3", b: "A4", order: 2, round: 1, label: "7th/8th place" }] } },
        { id: "po2", kind: "mapped", name: "Final", order: 2, discipline: "singles", generation: "automatic", waitForOrganiser: false,
          progression: { mode: "all_continue", standings: "reset" }, schedule: playBy("2026-11-21"),
          mapping: { source: "stage_winners", sourceStageId: "po1", pools: 1, poolSize: 4, discipline: "singles",
            units: [unit("A1", 0, 1), unit("A2", 0, 2), unit("A3", 0, 3), unit("A4", 0, 4)],
            matches: [{ a: "A1", b: "A2", order: 1, round: 1 }, { a: "A3", b: "A4", order: 2, round: 1, label: "5th/6th place" }] } },
      ],
    }],
  };
}

function setup() {
  const env = fakeDb();
  env.t.tournaments = [{ id: "t", builder_architecture: "structured", builder_spec: spec(), start_date: "2026-10-01", end_date: "2026-11-30" }];
  env.t.club_champs_entries = Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, champ_id: "t", club_member_id: `p${i + 1}`, group_number: 1, order_index: i }));
  return env;
}
const rows = (env: any, stage: string) => env.t.club_champs_matches.filter((m: any) => m.stage_key === stage);
const pair = (m: any) => [m.player_a_member_id, m.player_b_member_id].sort().join(" v ");
/** Lower player number wins, except the listed games (winner given explicitly). */
function play(env: any, stage: string, except: Array<[string, string]> = [], skip: (m: any) => boolean = () => false) {
  for (const m of rows(env, stage).filter((x: any) => !x.winner_member_id && !skip(x))) {
    const n = (id: string) => Number(id.slice(1));
    const forced = except.find(([w, l]) => [m.player_a_member_id, m.player_b_member_id].sort().join() === [w, l].sort().join());
    m.winner_member_id = forced ? forced[0] : n(m.player_a_member_id) < n(m.player_b_member_id) ? m.player_a_member_id : m.player_b_member_id;
    m.status = "completed"; m.score = "3-0";
  }
}

describe("play-off games are created as soon as both places are certain", () => {
  it("Men's A case: pool A done, pool B has only its 1st/2nd decider open → only the two 5th–8th semis are created", async () => {
    const env = setup();
    await generateStructuredTournament(env.db, "t");
    const main = rows(env, "main");
    const poolB = main.filter((m: any) => m.pool_number === 2);
    const bPlayers = [...new Set(poolB.flatMap((m: any) => [m.player_a_member_id, m.player_b_member_id]))].sort((a: any, b: any) => Number(a.slice(1)) - Number(b.slice(1))) as string[];
    const [b1, b2] = bPlayers; // the two strongest of pool B meet last
    const decider = (m: any) => pair(m) === [b1, b2].sort().join(" v ");
    play(env, "main", [], decider);
    await autoProgress(env.db, "t");
    const sf = rows(env, "po1");
    expect(sf.map((m: any) => m.bracket_position).sort()).toEqual([3, 4]);
    expect(sf.every((m: any) => m.stage_label === "Semifinal (5th–8th)")).toBe(true);
    // nothing else moved: top semis, finals and 3rd place still wait
    expect(rows(env, "po2")).toHaveLength(0);
    expect(rows(env, "po2-3p")).toHaveLength(0);

    // The decider is played → the two top semis are added (same round record, no duplicates).
    play(env, "main");
    await autoProgress(env.db, "t");
    expect(rows(env, "po1").map((m: any) => m.bracket_position).sort()).toEqual([1, 2, 3, 4]);
    expect(env.t.club_champs_rounds.filter((r: any) => r.stage_key === "po1")).toHaveLength(1);
  });

  it("5th/6th and 7th/8th games appear once both 5th–8th semis are played, before the top semis finish", async () => {
    const env = setup();
    await generateStructuredTournament(env.db, "t");
    play(env, "main");
    await autoProgress(env.db, "t");
    expect(rows(env, "po1")).toHaveLength(4);
    play(env, "po1", [], (m) => m.bracket_position <= 2); // only the bottom semis
    await autoProgress(env.db, "t");
    expect(rows(env, "po2").map((m: any) => m.stage_label)).toEqual(["5th/6th place"]);
    expect(rows(env, "po2-3p").map((m: any) => m.stage_label)).toEqual(["7th/8th place"]);
    // The Final stage is not complete with half its games: the title Final still follows the top semis.
    play(env, "po1");
    await autoProgress(env.db, "t");
    expect(rows(env, "po2")).toHaveLength(2);
    expect(rows(env, "po2-3p")).toHaveLength(2);
  });

  it("nothing is created early while a place can still change", async () => {
    const env = setup();
    await generateStructuredTournament(env.db, "t");
    // Only round 1 played: every place is still open.
    const r1 = (m: any) => m.round_number !== 1;
    play(env, "main", [], r1);
    await autoProgress(env.db, "t");
    expect(rows(env, "po1")).toHaveLength(0);
  });
});

describe("settled pool positions (wins only, strictly apart in every outcome)", () => {
  const d: any = { divisionId: "g", entrants: ["a", "b", "c", "d"].map((id) => ({ id })), seeding: { method: "snake" } };
  const src: any = { id: "s", kind: "round_robin", name: "RR" };
  const g = (a: string, b: string, w?: string) => ({ stage_key: "s", pool_number: 1, player_a_member_id: a, player_b_member_id: b, winner_member_id: w ?? null, status: w ? "completed" : "scheduled", score: w ? "3-0" : null });
  it("three-way tie possible → those places stay open; the clear leader is settled", () => {
    // Ladies B Pool A shape: a 3 wins; b 1 (beat c); c 1 (beat d)… d v c open could make b/c/d level on 1.
    const m = [g("a", "b", "a"), g("a", "c", "a"), g("a", "d", "a"), g("b", "d", "b"), g("c", "b", "c"), g("c", "d")];
    const s = settledPoolPositions(d, src, m);
    expect(s.get("0:1")).toBe("a");
    expect(s.has("0:2")).toBe(false);
    expect(s.has("0:3")).toBe(false);
    expect(s.has("0:4")).toBe(false);
  });
});

describe("placeholder slots hand over by game number", () => {
  it("real games 3 and 4 take placeholders 3 and 4, never 1 and 2", () => {
    const ph = [1, 2, 3, 4].map((o) => ({ id: `ph${o}`, group: 1, stageKey: "po1#ph", order: o, date: null, time: null, courtId: null }));
    const real = [3, 4].map((o) => ({ id: `r${o}`, group: 1, stageKey: "po1", order: o, date: null, time: null, courtId: null }));
    expect(placeholderAdoption(ph, real).map((x) => `${x.placeholder.id}>${x.real.id}`)).toEqual(["ph3>r3", "ph4>r4"]);
  });
});
