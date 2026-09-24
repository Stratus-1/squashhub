import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DraftAutosaver } from "@/lib/smart-builder/draft-autosave";
import { DefinitionSchema, parseDefinition, type TournamentDefinition } from "@/lib/smart-builder/definition";
import { specFromDefinition } from "@/lib/tournaments/structured-persist";

/** In-memory smart_tournament_drafts row with the same revision rule as the real update. */
function serverDraft(initial: TournamentDefinition) {
  const row = { definition: JSON.parse(JSON.stringify(initial)), last_tab: null as string | null, revision: 0, status: "draft" };
  const writes: string[] = [];
  let fail = false;
  const write = async (p: { def: TournamentDefinition; tab: string }, rev: number) => {
    writes.push("smart_tournament_drafts");
    if (fail) throw new Error("network down");
    if (row.revision !== rev) return null;
    row.definition = JSON.parse(JSON.stringify(p.def)); // JSON round-trip, as jsonb
    row.last_tab = p.tab; row.revision = rev + 1;
    return row.revision;
  };
  return { row, writes, write, setFail: (v: boolean) => { fail = v; } };
}
const reopen = (row: { definition: unknown }) => { const p = parseDefinition(row.definition); if (!p.ok) throw new Error("parse"); return p.value; };

const full = (): TournamentDefinition => DefinitionSchema.parse({
  name: "Men's Championship",
  event: {
    scope: "regional", ownerId: "nsa", ownerName: "NSA", audience: "league_players", expectedEntries: 24, seedingSource: "regional",
    venues: { mode: "multiple", clubIds: ["A", "B"], names: ["Club A", "Club B"], courtIds: { A: [11, 12, 13, 14], B: [21, 23] } },
  },
  scheduleDefaults: { startDate: "2026-09-28", endDate: "2026-10-05", startTime: "18:00", venueClubIds: ["A", "B"], rotateVenues: true, matchMinutes: 45 },
  comms: { inviteSending: "manual", inviteChannels: ["email"], entryFeeRands: 150 },
  divisions: [{ id: "men", name: "Men A", sections: [{ id: "s", name: "Main", stages: [
    { id: "pools", name: "Pool stage", kind: "round_robin", groups: 4, groupSize: 6, input: { entrants: 24 }, poolNames: ["Red", "Blue", "Green", "Gold"],
      schedule: { mode: "play_by", startDate: "2026-09-28", endDate: "2026-10-02" } },
    { id: "ko", name: "Play-offs", kind: "knockout", input: { entrants: 8 },
      transition: { qualify: { positions: [1, 2] }, method: "cross_pool", crossPairs: [[0, 3], [1, 2]], pairing: "winner_vs_runner_up" },
      schedule: { mode: "fixed", startDate: "2026-10-03", endDate: "2026-10-05", roundDates: ["2026-10-03", "2026-10-04", "2026-10-05"] } },
  ] }] }],
} as any);

describe("Beta draft persistence", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("1–6/12. whole draft (owner, audience, venues/courts, stages, mappings, schedule, tab) survives leave/reload exactly", async () => {
    const d = full();
    const srv = serverDraft(DefinitionSchema.parse({}));
    const s = new DraftAutosaver(srv.write, 0, 800);
    s.schedule({ def: d, tab: "schedule" });
    await s.flush(); // leaving the builder flushes
    const back = reopen(srv.row);
    expect(back.event).toEqual(d.event);
    expect(back.event?.venues?.courtIds).toEqual({ A: [11, 12, 13, 14], B: [21, 23] });
    expect(back.divisions[0].sections[0].stages.map((x) => x.id)).toEqual(["pools", "ko"]);
    expect(back.divisions[0].sections[0].stages[1]).toEqual(d.divisions[0].sections[0].stages[1]);
    expect(back.scheduleDefaults).toEqual(d.scheduleDefaults);
    expect(back).toEqual(d);
    expect(srv.row.last_tab).toBe("schedule");
  });

  it("debounces typing into a single write, and never says Saved before the server confirms", async () => {
    const srv = serverDraft(DefinitionSchema.parse({}));
    const s = new DraftAutosaver(srv.write, 0, 800);
    const seen: string[] = []; s.subscribe((st) => seen.push(st.status));
    for (const n of ["M", "Me", "Men"]) s.schedule({ def: DefinitionSchema.parse({ name: n }), tab: "design" });
    expect(s.state.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(900);
    expect(srv.writes).toHaveLength(1);
    expect(reopen(srv.row).name).toBe("Men");
    expect(seen.indexOf("saved")).toBeGreaterThan(seen.indexOf("saving"));
  });

  it("7. a failed save is reported, keeps the data, and Retry saves it", async () => {
    const srv = serverDraft(DefinitionSchema.parse({})); srv.setFail(true);
    const s = new DraftAutosaver(srv.write, 0, 800);
    s.schedule({ def: DefinitionSchema.parse({ name: "Kept" }), tab: "design" });
    await s.flush();
    expect(s.state.status).toBe("error");
    expect(s.state.savedAt).toBeNull();
    expect(s.hasUnsaved).toBe(true);
    srv.setFail(false);
    await s.retry();
    expect(s.state.status).toBe("saved");
    expect(reopen(srv.row).name).toBe("Kept");
  });

  it("detects a stale second tab instead of overwriting newer work", async () => {
    const srv = serverDraft(DefinitionSchema.parse({}));
    const tab1 = new DraftAutosaver(srv.write, 0, 800), tab2 = new DraftAutosaver(srv.write, 0, 800);
    tab1.schedule({ def: DefinitionSchema.parse({ name: "Newer" }), tab: "design" }); await tab1.flush();
    tab2.schedule({ def: DefinitionSchema.parse({ name: "Stale" }), tab: "design" }); await tab2.flush();
    expect(tab2.state.status).toBe("conflict");
    expect(reopen(srv.row).name).toBe("Newer");
  });

  it("8/11. autosave writes only the draft row — no tournament, structure or fixtures", async () => {
    const srv = serverDraft(DefinitionSchema.parse({}));
    const s = new DraftAutosaver(srv.write, 0, 10);
    s.schedule({ def: full(), tab: "players" }); await s.flush();
    expect(new Set(srv.writes)).toEqual(new Set(["smart_tournament_drafts"]));
    expect(srv.row.status).toBe("draft");
  });

  it("9. generation from a reopened draft uses the latest persisted spec", async () => {
    const srv = serverDraft(DefinitionSchema.parse({}));
    const s = new DraftAutosaver(srv.write, 0, 10);
    const d = full();
    s.schedule({ def: d, tab: "review" }); await s.flush();
    expect(JSON.stringify(specFromDefinition(reopen(srv.row)))).toBe(JSON.stringify(specFromDefinition(d)));
  });

  it("10. legacy drafts without new fields still open", () => {
    expect(parseDefinition({ name: "Old", divisions: [] }).ok).toBe(true);
  });
});
