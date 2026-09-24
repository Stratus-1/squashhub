import { describe, it, expect } from "vitest";
import { DefinitionSchema, type TournamentDefinition } from "@/lib/smart-builder/definition";
import {
  courtRemovalImpact, eligibleVenueClubIds, regionsUnder, rotatedVenueFor, rotationVenueIds, selectedCourtPool,
  subordinateClubIds, tournamentCourts, venueRowsFromDefinition, venueScopeIssues, venuesValid, type CourtLite, type OrgLite,
} from "@/lib/smart-builder/venues";
import { insertFixtures, loadEntrants, persistStructure, specFromDefinition, type Db } from "@/lib/tournaments/structured-persist";
import { generateFromSpec } from "@/lib/tournaments/engine-service";

const orgs: OrgLite[] = [
  { id: "ssa", name: "SSA", kind: "national", club_id: null },
  { id: "nsa", name: "NSA", kind: "association", club_id: null },
  { id: "msa", name: "MSA", kind: "association", club_id: null },
  { id: "oA", name: "Club A", kind: "club", club_id: "A" },
  { id: "oB", name: "Club B", kind: "club", club_id: "B" },
  { id: "oC", name: "Club C", kind: "club", club_id: "C" },
  { id: "oN", name: "Nelspruit", kind: "club", club_id: "N" },
];
const rels = [
  { parent_org_id: "ssa", child_org_id: "nsa" }, { parent_org_id: "ssa", child_org_id: "msa" },
  { parent_org_id: "nsa", child_org_id: "oA" }, { parent_org_id: "nsa", child_org_id: "oB" },
  { parent_org_id: "msa", child_org_id: "oC" }, { parent_org_id: "msa", child_org_id: "oN" },
];
const courts: CourtLite[] = [
  ...[1, 2, 3, 4].map((i) => ({ court_id: i, name: `Court ${i}`, club_id: "N" })),
  { court_id: 5, name: "Old court", club_id: "N", active: false },
  ...[11, 12, 13, 14].map((i) => ({ court_id: i, name: `Court ${i - 10}`, club_id: "A" })),
  ...[21, 22, 23].map((i) => ({ court_id: i, name: `Court ${i - 20}`, club_id: "B" })),
];

const withVenues = (clubIds: string[], courtIds: Record<string, number[]>, extra: Partial<TournamentDefinition["event"]> = {}) =>
  DefinitionSchema.parse({ event: { scope: "regional", ownerId: "nsa", venues: { mode: "multiple", clubIds, names: clubIds, courtIds }, ...extra } });

describe("hierarchy-backed venues and real courts", () => {
  it("1. club event offers the owning club and its active courts", () => {
    expect(eligibleVenueClubIds("club", orgs.find((o) => o.id === "oN"), orgs, rels)).toEqual(["N"]);
    expect(tournamentCourts(courts, "N").map((c) => c.court_id)).toEqual([1, 2, 3, 4]);
  });

  it("2. inactive courts never appear as tournament courts", () => {
    expect(tournamentCourts(courts).some((c) => c.court_id === 5)).toBe(false);
  });

  it("3. regional event only offers clubs under the association (no fallback to all clubs)", () => {
    expect(eligibleVenueClubIds("regional", orgs.find((o) => o.id === "nsa"), orgs, rels).sort()).toEqual(["A", "B"]);
    const lonely: OrgLite = { id: "x", name: "Empty", kind: "association", club_id: null };
    expect(eligibleVenueClubIds("regional", lonely, [...orgs, lonely], rels)).toEqual([]);
  });

  it("4. selecting a regional host club exposes its real courts; pool counts only selected ones", () => {
    const d = withVenues(["A", "B"], { A: [11, 12, 13, 14], B: [21, 22, 23] });
    expect(selectedCourtPool(d)).toHaveLength(7);
    expect(venuesValid(d)).toBe(true);
    expect(venuesValid(withVenues(["A", "B"], { A: [11], B: [] }))).toBe(false); // every venue must contribute a court
  });

  it("5. national event navigates Region → Club → Courts", () => {
    expect(regionsUnder("ssa", orgs, rels).map((r) => r.id).sort()).toEqual(["msa", "nsa"]);
    expect(subordinateClubIds("msa", orgs, rels).sort()).toEqual(["C", "N"]);
    expect(tournamentCourts(courts, "N")).toHaveLength(4);
  });

  it("6. multi-club venue rows keep each club's court IDs (the fixture's venue is its court's club)", () => {
    const rows = venueRowsFromDefinition(withVenues(["A", "B"], { A: [12, 11], B: [23] }), "A");
    expect(rows).toEqual([{ club_id: "A", court_ids: [11, 12], is_primary: true }, { club_id: "B", court_ids: [23], is_primary: false }]);
  });

  it("7. rotating venues uses only selected venue IDs, and is irrelevant with one venue", () => {
    const d = withVenues(["A", "B"], { A: [11], B: [21] });
    expect(rotationVenueIds(d)).toEqual(["A", "B"]);
    expect([1, 2, 3].map((r) => rotatedVenueFor(d, r))).toEqual(["A", "B", "A"]);
    expect(rotationVenueIds(withVenues(["A"], { A: [11] }))).toHaveLength(1);
  });

  it("8. removing a court with unplayed games needs reassignment first", () => {
    const i = courtRemovalImpact([11, 12], [{ court_id: 11, status: "scheduled" }]);
    expect(i).toMatchObject({ future: [11], history: [], free: [12], blocked: true });
  });

  it("9. a court used by played games can't be removed — history is never rewritten", () => {
    const i = courtRemovalImpact([11], [{ court_id: 11, status: "completed" }, { court_id: 11, status: "scheduled" }]);
    expect(i).toMatchObject({ history: [11], future: [], blocked: true });
  });

  it("10. changing owner/level flags venues that are no longer eligible", () => {
    const d = withVenues(["A", "B"], { A: [11], B: [21] });
    const newEligible = eligibleVenueClubIds("regional", orgs.find((o) => o.id === "msa"), orgs, rels);
    expect(venueScopeIssues(d, newEligible).sort()).toEqual(["A", "B"]);
    expect(venuesValid(withVenues(["A"], { A: [11] }, { venuesStale: ["A"] }))).toBe(false);
  });

  it("11. legacy drafts without court selections still validate as before", () => {
    const legacy = DefinitionSchema.parse({ event: { venues: { mode: "single", clubIds: ["N"], names: ["N"] } } });
    expect(venuesValid(legacy)).toBe(true);
    expect(selectedCourtPool(legacy)).toEqual([]);
  });
});

describe("12. atomic generation refuses unselected courts", () => {
  const def = DefinitionSchema.parse({
    name: "Courts", divisions: [{ id: "men", name: "Men", sections: [{ id: "s", name: "Main", stages: [
      { id: "rr", name: "Round robin", kind: "round_robin", groups: 1, groupSize: 4, input: { entrants: 4 }, schedule: { mode: "play_by" } },
    ] }] }],
  });
  function fakeDb() {
    const s = specFromDefinition(def);
    const t: Record<string, any[]> = {
      tournaments: [{ id: "t", builder_architecture: "structured", builder_spec: s }],
      tournament_venues: [{ id: "v", tournament_id: "t", club_id: "N", court_ids: [1, 2] }],
      club_champs_entries: Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, champ_id: "t", club_member_id: `m${i}`, group_number: 1, order_index: i })),
    };
    let n = 0;
    const match = (r: any, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
    const db: Db = {
      async insert(table, rows) { const out = rows.map((r) => ({ id: `${table}-${++n}`, ...r })); (t[table] ??= []).push(...out); return out; },
      async select(table, f) { return (t[table] ?? []).filter((r) => match(r, f)); },
      async update(table, f, patch) { (t[table] ?? []).filter((r) => match(r, f)).forEach((r) => Object.assign(r, patch)); },
      async remove(table, ids) { t[table] = (t[table] ?? []).filter((x) => !ids.includes(x.id)); },
    };
    return { db, t, s };
  }

  it("rejects a fixture on a court outside the tournament's selection, accepts a selected one", async () => {
    const { db, t, s } = fakeDb();
    const spec = await loadEntrants(db, "t", s);
    const ids = await persistStructure(db, "t", spec);
    const [f] = generateFromSpec(spec, "t");
    await expect(insertFixtures(db, "t", spec, ids, [{ ...f, courtId: 9 }])).rejects.toThrow(/not one of the tournament's selected courts/);
    expect(t.club_champs_matches ?? []).toHaveLength(0);
    const rows = await insertFixtures(db, "t", spec, ids, [{ ...f, courtId: 2 }]);
    expect(rows[0].court_id).toBe(2);
  });
});
