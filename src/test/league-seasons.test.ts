import { describe, it, expect } from "vitest";
import {
  DEFAULT_SEASON_YEAR,
  resolveCurrentSeason,
  seasonLabel,
  sortSeasons,
  type LeagueSeason,
} from "@/lib/leagues/seasons";

const season = (over: Partial<LeagueSeason>): LeagueSeason => ({
  id: "s1",
  association_id: "a1",
  platform_association_id: null,
  club_id: "c1",
  season_year: 2026,
  label: "2026",
  status: "active",
  is_current: false,
  starts_on: null,
  ends_on: null,
  ...over,
});

describe("league seasons", () => {
  it("returns null when there are no seasons", () => {
    expect(resolveCurrentSeason([])).toBeNull();
  });

  it("defaults to the flagged current season", () => {
    const seasons = [
      season({ id: "a", season_year: 2027 }),
      season({ id: "b", season_year: 2026, is_current: true }),
    ];
    expect(resolveCurrentSeason(seasons)?.id).toBe("b");
  });

  it("defaults to 2026 for existing live data", () => {
    const seasons = [season({ id: "b", season_year: 2026, is_current: true })];
    expect(resolveCurrentSeason(seasons)?.season_year).toBe(DEFAULT_SEASON_YEAR);
  });

  it("honours an explicit selection", () => {
    const seasons = [
      season({ id: "a", season_year: 2027 }),
      season({ id: "b", season_year: 2026, is_current: true }),
    ];
    expect(resolveCurrentSeason(seasons, "a")?.id).toBe("a");
  });

  it("falls back to the newest season when none is flagged", () => {
    const seasons = [season({ id: "a", season_year: 2025 }), season({ id: "b", season_year: 2027 })];
    expect(resolveCurrentSeason(seasons)?.id).toBe("b");
  });

  it("sorts current first then newest", () => {
    const sorted = sortSeasons([
      season({ id: "a", season_year: 2027 }),
      season({ id: "b", season_year: 2026, is_current: true }),
      season({ id: "c", season_year: 2025 }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });

  it("labels a missing season with the default year", () => {
    expect(seasonLabel(null)).toBe(String(DEFAULT_SEASON_YEAR));
    expect(seasonLabel(season({ label: "2026 Winter" }))).toBe("2026 Winter");
  });
});
