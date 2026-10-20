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