import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEASON_YEAR,
  nextSeasonYear,
  pickSeasonScoped,
  resolveCurrentSeason,
  seasonLabel,
  sortSeasons,
  type LeagueSeason,
} from "@/lib/leagues/seasons";

const season = (over: Partial<LeagueSeason>): LeagueSeason => ({
  id: over.id ?? "s",
  association_id: over.association_id ?? "a1",
  platform_association_id: over.platform_association_id ?? null,
  club_id: over.club_id ?? "c1",
  season_year: over.season_year ?? 2026,
  label: over.label ?? String(over.season_year ?? 2026),
  status: over.status ?? "active",
  is_current: over.is_current ?? false,
  starts_on: over.starts_on ?? null,
  ends_on: over.ends_on ?? null,
});

describe("league seasons", () => {
  const s2026 = season({ id: "s26", season_year: 2026, is_current: true });
  const s2027 = season({ id: "s27", season_year: 2027 });

  it("sorts current first, then newest", () => {
    expect(sortSeasons([s2027, s2026]).map((s) => s.id)).toEqual(["s26", "s27"]);
  });

  it("resolves the explicitly selected season", () => {
    expect(resolveCurrentSeason([s2026, s2027], "s27")?.id).toBe("s27");
  });

  it("falls back to the current-flagged season", () => {
    expect(resolveCurrentSeason([s2027, s2026])?.id).toBe("s26");
  });

  it("returns null with no seasons and labels a missing season with the default year", () => {
    expect(resolveCurrentSeason([])).toBeNull();
    expect(seasonLabel(null)).toBe(String(DEFAULT_SEASON_YEAR));
  });

  it("suggests the year after the newest season", () => {
    expect(nextSeasonYear([s2026, s2027])).toBe(2028);
  });

  describe("pickSeasonScoped", () => {
    const rows = [
      { code: "A", season_id: "s26" },
      { code: "B", season_id: "s27" },
      { code: "C", season_id: null },
    ];

    it("returns everything when no season is selected (legacy behaviour)", () => {
      expect(pickSeasonScoped(rows, null)).toHaveLength(3);
    });

    it("scopes rows to the selected season", () => {
      expect(pickSeasonScoped(rows, "s27").map((r) => r.code)).toEqual(["B"]);
    });

    it("never lets a later season relabel an earlier one", () => {
      expect(pickSeasonScoped(rows, "s26").map((r) => r.code)).toEqual(["A"]);
    });

    it("falls back to unlinked legacy rows when the season has none", () => {
      expect(pickSeasonScoped(rows, "s99").map((r) => r.code)).toEqual(["C"]);
    });
  });
});
