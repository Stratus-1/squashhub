import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const rows = () => state.tables[table] ?? [];
    const chain: any = {
      select: () => chain, eq: () => chain, order: () => chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: any, reject: any) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return chain;
  }, rpc: state.rpc,
} }));

import { createDecidedSwissGames } from "../decided-swiss";
import { canScheduleFixture } from "../fixture-scheduling";
import { resolveFixtureSchedule } from "../stage-schedule";
import { RIVERSIDE_CLUB_ID } from "../swiss-riverside-aabb-charts";

beforeEach(() => {
  state.tables = {
    club_champs: [{ id: "fictional-riverside", club_id: "riverside-test", swiss_rounds: { "4": 3 } }],
    courts: [], tournaments: [],
    club_champs_entries: Array.from({ length: 8 }, (_, i) => ({ group_number: 4, order_index: i, club_member_id: `p${i + 1}` })),
    club_champs_matches: [1, 2, 3, 4].map((p) => ({ id: `r1-${p}`, group_number: 4, round_number: 1, player_a_member_id: `p${p}`, player_b_member_id: `p${9 - p}`, winner_member_id: `p${p}`, status: "completed" })),
    club_champs_rounds: [{ id: "r2", group_number: 4, round_number: 2, scheduling_mode: "self", play_by: "2026-10-29" }],
  };
  state.rpc.mockReset();
  state.rpc.mockImplementation(async (name, args) => {
    if (name !== "create_decided_swiss_game") throw new Error("Play-by must not reserve a court");
    const id = `created-${state.tables.club_champs_matches.length}`;
    state.tables.club_champs_matches.push({ id, round_id: "r2", champ_id: args.p_tid, group_number: args.p_group, round_number: args.p_round, player_a_member_id: args.p_a, player_b_member_id: args.p_b, status: "scheduled" });
    return { data: id, error: null };
  });
});

describe("synthetic Riverside play-by creation through writer", () => {
  it("saves all R3–5 RR games and Swiss remainder through the actual writer without creating rounds or bookings", async () => {
    state.tables.club_champs[0].club_id = RIVERSIDE_CLUB_ID;
    state.tables.club_champs_entries = Array.from({ length: 18 }, (_, i) => ({ group_number: 4, order_index: i, club_member_id: `p${i + 1}` }));
    state.tables.tournaments = [{ builder_architecture: "structured", builder_spec: { divisions: [{ divisionId: "d", groupNumber: 4, stages: [{ id: "swiss", order: 0, kind: "swiss", swissRounds: 5, tieBreaks: ["position_swap"], rrFinish: { enabled: true, groups: 3 } }] }] } }];
    const match = (r: number, a: number, b: number | null) => ({ id: `r${r}-${a}`, group_number: 4, round_number: r, player_a_member_id: `p${a}`, player_b_member_id: b ? `p${b}` : null, winner_member_id: `p${a}`, is_bye: b === null, status: "completed" });
    state.tables.club_champs_matches = [
      ...[[1,5],[2,6],[3,9],[4,10],[7,11],[8,12],[13,16],[14,17],[15,18]].map(([a,b]) => match(1, a, b)),
      ...[[1,6],[2,7],[3,10],[4,11],[5,12],[8,9],[13,17],[14,18],[15,16]].map(([a,b]) => match(2, a, b)),
    ];
    state.tables.club_champs_rounds = [3,4,5].map((r) => ({ id: `r${r}`, group_number: 4, round_number: r, scheduling_mode: "self", play_by: `2026-11-0${r}` }));
    const roundsBefore = JSON.stringify(state.tables.club_champs_rounds);
    for (const r of [3,4,5]) {
      const outcome = await createDecidedSwissGames("fictional-riverside");
      // Groups freeze after Round 2, so all 18 group games (R3–5) appear at once; the remainder follows round by round.
      expect(outcome, `Round ${r}`).toEqual({ created: r === 3 ? 9 + 6 + 6 : 3, booked: 0, issues: [] });
      const games = state.tables.club_champs_matches.filter((m) => m.round_number === r);
      expect(games).toHaveLength(9);
      const grouped = games.filter((m) => Number(m.player_a_member_id.slice(1)) <= 12);
      expect(grouped).toHaveLength(6);
      expect(grouped.every((m) => Math.floor((Number(m.player_a_member_id.slice(1))-1)/4) === Math.floor((Number(m.player_b_member_id.slice(1))-1)/4))).toBe(true);
      expect(games.filter((m) => Number(m.player_a_member_id.slice(1)) >= 13).flatMap((m) => [m.player_a_member_id,m.player_b_member_id]).sort()).toEqual(["p13","p14","p15","p16","p17","p18"]);
      expect(await createDecidedSwissGames("fictional-riverside")).toEqual({ created: 0, booked: 0, issues: [] });
      games.forEach((m) => { m.status = "completed"; m.winner_member_id = m.player_a_member_id; });
    }
    const history = state.tables.club_champs_matches.filter((m) => m.player_b_member_id).map((m) => [m.player_a_member_id,m.player_b_member_id].sort().join("|"));
    expect(new Set(history).size).toBe(history.length);
    expect(JSON.stringify(state.tables.club_champs_rounds)).toBe(roundsBefore);
  });
  it("creates later games as soon as both players are known, without waiting for unrelated open games", async () => {
    state.tables.club_champs[0].club_id = RIVERSIDE_CLUB_ID;
    state.tables.club_champs_entries = Array.from({ length: 18 }, (_, i) => ({ group_number: 4, order_index: i, club_member_id: `p${i + 1}` }));
    state.tables.tournaments = [{ builder_architecture: "structured", builder_spec: { divisions: [{ divisionId: "d", groupNumber: 4, stages: [{ id: "swiss", order: 0, kind: "swiss", swissRounds: 5, tieBreaks: ["position_swap"], rrFinish: { enabled: true, groups: 3 } }] }] } }];
    const match = (r: number, a: number, b: number) => ({ id: `r${r}-${a}`, group_number: 4, round_number: r, player_a_member_id: `p${a}`, player_b_member_id: `p${b}`, winner_member_id: `p${a}`, status: "completed" });
    state.tables.club_champs_matches = [
      ...[[1,5],[2,6],[3,9],[4,10],[7,11],[8,12],[13,16],[14,17],[15,18]].map(([a,b]) => match(1, a, b)),
      ...[[1,6],[2,7],[3,10],[4,11],[5,12],[8,9],[13,17],[14,18],[15,16]].map(([a,b]) => match(2, a, b)),
    ];
    state.tables.club_champs_rounds = [3,4,5].map((r) => ({ id: `r${r}`, group_number: 4, round_number: r, scheduling_mode: "self", play_by: `2026-11-0${r}` }));
    await createDecidedSwissGames("fictional-riverside");
    // Round 3: every remainder game and all group games but one are finished.
    const r3 = state.tables.club_champs_matches.filter((m) => m.round_number === 3);
    const openGroupGame = r3.find((m) => Number(m.player_a_member_id.slice(1)) <= 12)!;
    r3.forEach((m) => { if (m !== openGroupGame) { m.status = "completed"; m.winner_member_id = m.player_a_member_id; } });
    state.rpc.mockClear();
    expect(await createDecidedSwissGames("fictional-riverside")).toEqual({ created: 3, booked: 0, issues: [] });
    const r4 = state.tables.club_champs_matches.filter((m) => m.round_number === 4);
    expect(r4).toHaveLength(9);
    // Remainder games use the normal per-player check (both finished Round 3), never the group bypass.
    for (const [, args] of state.rpc.mock.calls) expect(args.p_rr_finish_block).toBe(false);
  });
  it("saves four confirmed games, reads their round deadline and exposes participant booking permission", async () => {
    expect(await createDecidedSwissGames("fictional-riverside")).toEqual({ created: 4, booked: 0, issues: [] });
    expect(state.rpc).toHaveBeenCalledTimes(4);
    const created = state.tables.club_champs_matches.filter((m) => m.round_number === 2);
    expect(created).toHaveLength(4);
    for (const game of created) {
      expect(resolveFixtureSchedule(game, { rows: state.tables.club_champs_rounds })).toEqual({ mode: "play_by", playBy: "2026-10-29", bookable: true });
      expect(canScheduleFixture(game, game.player_a_member_id).allowed).toBe(true);
      expect(game.booking_id).toBeUndefined();
    }
    expect(await createDecidedSwissGames("fictional-riverside")).toEqual({ created: 0, booked: 0, issues: [] });
    expect(state.rpc).toHaveBeenCalledTimes(4);
  });
});