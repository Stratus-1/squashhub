import { describe, expect, it } from "vitest";
import {
  BYE_CODE,
  FALLBACK_TIER,
  buildTierStandings,
  deriveTiers,
  inSeason,
  tierOfFixture,
  type StandingsFixture,
} from "@/lib/leagues/team-standings";

const s2026 = { id: "s26", season_year: 2026 };
const fx = (o: Partial<StandingsFixture>): StandingsFixture => ({
  id: o.id ?? "f1",
  fixture_date: o.fixture_date ?? "2026-10-06",
  home_team_code: o.home_team_code ?? "T1",
  away_team_code: o.away_team_code ?? "T2",
  status: o.status ?? "scheduled",
  round_id: o.round_id ?? null,
  season_id: o.season_id ?? null,
});

describe("team standings", () => {
  it("brand-new league, first completed fixture, no round rows: standings appear immediately", () => {
    const fixtures = [fx({ id: "a" })];
    const tiers = deriveTiers([], fixtures, s2026);
    expect(tiers.map((t) => t.tier)).toEqual([FALLBACK_TIER]);
    const { rows } = buildTierStandings(fixtures, [
      { fixture_id: "a", home_total_points: 13, away_total_points: 16, status: "submitted" },
    ]);
    expect(rows[0]).toMatchObject({ team_code: "T2", total: 16, played: 1 });
    expect(rows[1]).toMatchObject({ team_code: "T1", total: 13, played: 1 });
  });

  it("a round without a season link still groups fixtures in the selected season", () => {
    const rounds = [{ id: "r1", name: "Round 1", round_number: 1, round_date: "2026-10-06", season_id: null }];
    const fixtures = [fx({ id: "a", round_id: "r1" })];
    const tiers = deriveTiers(rounds, fixtures, s2026);
    expect(tiers).toHaveLength(1);
    expect(tierOfFixture(fixtures[0], tiers)).toBe("Round 1");
  });

  it("doubles: totals use the saved result totals (rubbers + configured flat bonus), byes ignored", () => {
    const fixtures = [
      fx({ id: "a", home_team_code: "LG003", away_team_code: "LG002" }),
      fx({ id: "b", home_team_code: "LG001", away_team_code: BYE_CODE, status: "bye" }),
    ];
    const { rows } = buildTierStandings(fixtures, [
      { fixture_id: "a", home_total_points: 13, away_total_points: 16, status: "submitted" },
    ]);
    expect(rows.map((r) => r.team_code)).toEqual(["LG002", "LG003", "LG001"]);
    expect(rows[2].played).toBe(0);
    expect(rows[2].weeks[0].isBye).toBe(true);
  });

  it("draft results do not count", () => {
    const { rows } = buildTierStandings([fx({ id: "a" })], [
      { fixture_id: "a", home_total_points: 5, away_total_points: 3, status: "setup" },
    ]);
    expect(rows.every((r) => r.played === 0)).toBe(true);
  });

  it("season isolation: 2026 rows never leak into 2027", () => {
    const s2027 = { id: "s27", season_year: 2027 };
    expect(inSeason({ season_id: null, date: "2026-10-06" }, s2027)).toBe(false);
    expect(inSeason({ season_id: "s26", date: "2027-02-01" }, s2027)).toBe(false);
    expect(inSeason({ season_id: "s27", date: "2027-02-01" }, s2027)).toBe(true);
    expect(inSeason({ season_id: null, date: "2026-10-06" }, s2026)).toBe(true);
    const rounds = [{ id: "r1", name: "Round 1", round_number: 1, round_date: "2026-10-06", season_id: null }];
    expect(deriveTiers(rounds, [], s2027)).toEqual([]);
  });
});
