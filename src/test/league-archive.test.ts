import { describe, it, expect } from "vitest";
import {
  archivableSeasons,
  archiveConfirmation,
  filterActiveLeagues,
  filterArchivedLeagues,
  groupLeaguesBySeason,
  isArchivedLeague,
  resolveLeagueName,
  unarchiveWarning,
  type ArchivableLeague,
} from "@/lib/leagues/archive";

const L = (
  id: string,
  season: number | null,
  archived = false,
  name = id,
): ArchivableLeague => ({
  id,
  name,
  season_year: season,
  archived_at: archived ? "2026-12-01T00:00:00Z" : null,
});

describe("league season archive", () => {
  const rows = [
    L("a", 2026, true, "1st League"),
    L("b", 2026, true, "2nd League"),
    L("c", 2027, false, "1st League"),
    L("d", null, false, "Legacy league"),
  ];

  it("hides archived seasons from active selectors", () => {
    const active = filterActiveLeagues(rows);
    expect(active.map((l) => l.id)).toEqual(["c", "d"]);
    expect(filterArchivedLeagues(rows).map((l) => l.id)).toEqual(["a", "b"]);
    expect(isArchivedLeague(rows[0])).toBe(true);
  });

  it("preserves ids and rows — archiving never deletes", () => {
    const all = [...filterActiveLeagues(rows), ...filterArchivedLeagues(rows)];
    expect(all).toHaveLength(rows.length);
    expect(new Set(all.map((l) => l.id))).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("still resolves names/links for archived history", () => {
    expect(resolveLeagueName(rows, "a")).toBe("1st League");
    expect(resolveLeagueName(rows, "zzz")).toBeNull();
  });

  it("groups by season newest first with undated last", () => {
    const groups = groupLeaguesBySeason(rows);
    expect(groups.map((g) => g.seasonYear)).toEqual([2027, 2026, null]);
    const s2026 = groups.find((g) => g.seasonYear === 2026)!;
    expect(s2026.archived).toBe(true);
    expect(s2026.partial).toBe(false);
    expect(s2026.activeCount).toBe(0);
  });

  it("lets a new season coexist with an archived prior season", () => {
    const s2027 = groupLeaguesBySeason(rows).find((g) => g.seasonYear === 2027)!;
    expect(s2027.archived).toBe(false);
    expect(filterActiveLeagues(rows).some((l) => l.season_year === 2027)).toBe(true);
    expect(filterActiveLeagues(rows).some((l) => l.season_year === 2026)).toBe(false);
  });

  it("flags partially archived seasons", () => {
    const mixed = [L("x", 2026, true), L("y", 2026, false)];
    const g = groupLeaguesBySeason(mixed)[0];
    expect(g.partial).toBe(true);
    expect(g.archived).toBe(false);
  });

  it("only offers archiving for dated seasons with live leagues", () => {
    expect(archivableSeasons(rows).map((g) => g.seasonYear)).toEqual([2027]);
  });

  it("warns when restoring an older season under a live newer one", () => {
    expect(unarchiveWarning(rows, 2026)).toContain("2027");
    expect(unarchiveWarning([L("a", 2025, true)], 2025)).toBeNull();
  });

  it("confirmation copy states history is preserved", () => {
    const text = archiveConfirmation(2026, 4);
    expect(text).toContain("4 league teams");
    expect(text.toLowerCase()).toContain("nothing is deleted");
    expect(text.toLowerCase()).toContain("read-only");
  });
});
