import { describe, expect, it } from "vitest";
import { individualAwards, readStandingsAwards, teamOutcome, fixturesComplete, compareByPoints, type OutcomeRow } from "@/lib/tournaments/standings-outcome";
import { validateStandingsUnits } from "@/lib/tournaments/structured-matchups";

const r = (id: string, group: number, pf: number, pa = 0, won = 0, played = 1, partnerId: string | null = null): OutcomeRow =>
  ({ id, partnerId, name: id, group, played, won, pointsFor: pf, pointsAgainst: pa });

describe("standings outcome config", () => {
  it("existing tournaments without config keep prior behaviour (null)", () => {
    expect(readStandingsAwards({})).toBeNull();
    expect(readStandingsAwards(null)).toBeNull();
  });
  it("no overall winner never shows champion/runner-up; awards stay opt-in", () => {
    const c = readStandingsAwards({ standings_awards: { outcome: "none", champion: true } })!;
    expect(c.champion).toBe(false);
    expect(c.woodenSpoon).toBe(false);
  });
});

describe("team/group outcome", () => {
  const rows = [r("a1", 1, 20, 10, 2), r("a2", 1, 5, 15, 0), r("b1", 2, 15, 5, 1), r("b2", 2, 18, 18, 1)];
  it("aggregates groups and only declares final when complete", () => {
    const t = teamOutcome([{ group: 1, label: "A" }, { group: 2, label: "B" }], rows, false);
    expect(t.teams.map((x) => x.points)).toEqual([25, 33]);
    expect(t.leader?.label).toBe("B");
    expect(t.state).toBe("current");
    expect(teamOutcome([{ group: 1, label: "A" }, { group: 2, label: "B" }], rows, true).state).toBe("final");
  });
  it("pending when nothing played", () => {
    const t = teamOutcome([{ group: 1, label: "A" }, { group: 2, label: "B" }], [r("a", 1, 0, 0, 0, 0), r("b", 2, 0, 0, 0, 0)], false);
    expect(t.state).toBe("pending");
    expect(t.leader).toBeNull();
  });
});

describe("individual awards across groups", () => {
  it("top scorer is across all groups, singles and pairs alike", () => {
    const a = individualAwards([r("a1", 1, 20), r("b1", 2, 30), r("p", 3, 25, 0, 0, 1, "q")], true);
    expect(a.topScorer!.rows.map((x) => x.id)).toEqual(["b1"]);
    expect(a.woodenSpoon!.rows.map((x) => x.id)).toEqual(["a1"]);
  });
  it("wooden spoon uses the same tie-break ordering", () => {
    const rows = [r("x", 1, 10, 30), r("y", 2, 10, 20), r("z", 1, 40)];
    expect(individualAwards(rows, true).woodenSpoon!.rows.map((x) => x.id)).toEqual(["x"]);
    expect([...rows].sort(compareByPoints).map((x) => x.id)).toEqual(["z", "y", "x"]);
  });
  it("incomplete tournament: top scorer is current, no wooden spoon; nothing played = pending", () => {
    const a = individualAwards([r("a", 1, 10), r("b", 2, 5)], false);
    expect(a.topScorer!.state).toBe("current");
    expect(a.woodenSpoon).toBeNull();
    expect(individualAwards([r("a", 1, 0, 0, 0, 0)], false).topScorer).toBeNull();
    expect(fixturesComplete([{ status: "completed" }, { status: "scheduled" }])).toBe(false);
  });
});

describe("standings unit validation", () => {
  const spec = (positions: string[][], discipline: string) => ({ divisions: [{ groupNumber: 1, stages: [{ mapping: { positions, discipline } }] }] });
  const mu = [{ groupNumber: 1, entryGroups: [1, 2], labels: ["6th", "7th"] }] as any;
  it("singles cross-group draw never raises a missing-partner warning", () => {
    const issues = validateStandingsUnits(spec([["a"], ["b"]], "singles"), [{ club_member_id: "a", group_number: 1 }, { club_member_id: "b", group_number: 2 }], mu);
    expect(issues).toEqual([]);
  });
  it("real doubles missing partner is still an error", () => {
    const issues = validateStandingsUnits(spec([["a+c"], ["b+d"]], "doubles"), [{ club_member_id: "a", partner_member_id: "c", group_number: 1 }, { club_member_id: "b", group_number: 2 }], mu);
    expect(issues.some((i) => /no partner/.test(i.message))).toBe(true);
  });
});
